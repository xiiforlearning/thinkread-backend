import { Logger } from '@nestjs/common';
import { Command, Ctx, Update } from 'nestjs-telegraf';
import { Context } from 'telegraf';
import { AppConfigService } from '../../../config/config.service';
import { Group } from '../../../domain/groups/group.entity';
import { GroupsService } from '../../../domain/groups/groups.service';
import { groupMessages } from '../../../domain/groups/messages';
import { presentationMessages } from '../../../domain/presentations/messages';
import { PresentationsService } from '../../../domain/presentations/presentations.service';
import { studentMessages } from '../../../domain/students/messages';
import { StudentsService } from '../../../domain/students/students.service';
import { TeacherResolverService } from '../../teacher/teacher-resolver.service';
import { BotInfoService } from '../services/bot-info.service';
import { buildGroupDeepLink } from '../utils/deep-link';

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Parse an on/off toggle argument (English or Russian). Returns null if unrecognized. */
function parseOnOff(arg: string | undefined): boolean | null {
  if (arg === 'on' || arg === 'вкл' || arg === 'включить') return true;
  if (arg === 'off' || arg === 'выкл' || arg === 'выключить' || arg === 'отключить') return false;
  return null;
}

@Update()
export class AdminHandler {
  private readonly logger = new Logger(AdminHandler.name);

  constructor(
    private readonly config: AppConfigService,
    private readonly groups: GroupsService,
    private readonly students: StudentsService,
    private readonly botInfo: BotInfoService,
    private readonly presentations: PresentationsService,
    private readonly teacher: TeacherResolverService,
  ) {}

  /** Group-scoped access: super-admin or current-group teacher. Silent no-op on deny. */
  private async hasGroupAccess(ctx: Context, group: Group): Promise<boolean> {
    const userId = ctx.from?.id;
    if (!userId) return false;
    if (this.config.isSuperAdmin(userId)) return true;
    return this.teacher.isTeacherInGroup(userId, group.chatId);
  }

  /** DM-scoped access: super-admin or cached teacher in any active group. */
  private async hasAnyAccess(ctx: Context): Promise<boolean> {
    const userId = ctx.from?.id;
    if (!userId) return false;
    if (this.config.isSuperAdmin(userId)) return true;
    return this.teacher.isTeacherInAnyActiveGroup(userId);
  }

  /**
   * Returns the persisted group for the current chat. If the chat is a group/supergroup
   * but no row exists, auto-upserts it — handles cases where `my_chat_member` was missed
   * during a bot outage. Returns null only for non-group chats.
   */
  private async resolveGroup(ctx: Context): Promise<Group | null> {
    const chat = ctx.chat;
    if (!chat || (chat.type !== 'group' && chat.type !== 'supergroup')) {
      return null;
    }
    const existing = await this.groups.findById(chat.id);
    if (existing) return existing;
    const title = 'title' in chat ? chat.title : 'Untitled';
    this.logger.warn(`Auto-upserting missing group ${chat.id} "${title}"`);
    return this.groups.upsert(chat.id, title);
  }

  @Command('link')
  async onLink(@Ctx() ctx: Context): Promise<void> {
    const group = await this.resolveGroup(ctx);
    if (!group || !ctx.chat) {
      await ctx.reply(groupMessages.onlyInGroup);
      return;
    }
    if (!(await this.hasGroupAccess(ctx, group))) return;
    const username = await this.botInfo.getUsername();
    const link = buildGroupDeepLink(username, ctx.chat.id);
    await ctx.reply(`${groupMessages.linkHeader}\n${link}`, {
      link_preview_options: { is_disabled: true },
    });
  }

  @Command('open_signup')
  async onOpenSignup(@Ctx() ctx: Context): Promise<void> {
    const group = await this.resolveGroup(ctx);
    if (!group || !ctx.chat) {
      await ctx.reply(groupMessages.onlyInGroup);
      return;
    }
    if (!(await this.hasGroupAccess(ctx, group))) return;
    const username = await this.botInfo.getUsername();
    const link = buildGroupDeepLink(username, ctx.chat.id);
    await ctx.reply(groupMessages.openSignupAnnouncement(group.title), {
      reply_markup: {
        inline_keyboard: [[{ text: groupMessages.openSignupButton, url: link }]],
      },
      link_preview_options: { is_disabled: true },
    });
    this.logger.log(`Signup opened in group ${ctx.chat.id} "${group.title}"`);
  }

  @Command('settings')
  async onSettings(@Ctx() ctx: Context): Promise<void> {
    const group = await this.resolveGroup(ctx);
    if (!group) {
      await ctx.reply(groupMessages.onlyInGroup);
      return;
    }
    if (!(await this.hasGroupAccess(ctx, group))) return;
    await ctx.reply(
      groupMessages.settings(group.title, group.morningTime, group.eveningTime, group.isActive),
    );
  }

  /**
   * /group_report on|off — toggle the public group post of the daily report.
   * In a group: affects that group. In DM: affects all groups where the caller
   * is a teacher (or all active groups for the super-admin). Teacher DMs are
   * unaffected — they always get the report.
   */
  @Command('group_report')
  async onGroupReport(@Ctx() ctx: Context): Promise<void> {
    const userId = ctx.from?.id;
    if (!userId) return;

    const chatType = ctx.chat?.type;
    let targets: Group[];
    if (chatType === 'group' || chatType === 'supergroup') {
      const group = await this.resolveGroup(ctx);
      if (!group) {
        await ctx.reply(groupMessages.onlyInGroup);
        return;
      }
      if (!(await this.hasGroupAccess(ctx, group))) return;
      targets = [group];
    } else if (chatType === 'private') {
      if (!(await this.hasAnyAccess(ctx))) return;
      targets = this.config.isSuperAdmin(userId)
        ? await this.groups.findAllActive()
        : await this.groups.findActiveByTeacher(userId);
    } else {
      return;
    }

    const message = ctx.message as { text?: string } | undefined;
    const arg = (message?.text ?? '').trim().split(/\s+/)[1]?.toLowerCase();
    const enabled = parseOnOff(arg);
    if (enabled === null) {
      await ctx.reply(groupMessages.groupReportUsage);
      return;
    }
    if (targets.length === 0) {
      await ctx.reply(groupMessages.groupReportNoGroups);
      return;
    }

    for (const g of targets) {
      await this.groups.setGroupReports(g.chatId, enabled);
    }
    this.logger.log(
      `group_report=${enabled} set for ${targets.length} group(s) by user ${userId}`,
    );
    await ctx.reply(groupMessages.groupReportSet(enabled, targets.map((g) => g.title)));
  }

  @Command('skip_presentation')
  async onSkipPresentation(@Ctx() ctx: Context): Promise<void> {
    const userId = ctx.from?.id;
    if (!userId) return;
    if (!(await this.hasAnyAccess(ctx))) return;

    const message = ctx.message as { text?: string } | undefined;
    const args = (message?.text ?? '').trim().split(/\s+/).slice(1);
    if (args.length === 0 || !UUID_RE.test(args[0])) {
      await ctx.reply(presentationMessages.skipUsage);
      return;
    }
    const studentId = args[0].toLowerCase();
    const student = await this.students.findById(studentId);
    if (!student) {
      await ctx.reply(presentationMessages.skipStudentNotFound(studentId));
      return;
    }
    // Non-super-admin teachers can only skip students in their own groups.
    if (!this.config.isSuperAdmin(userId)) {
      const teacherGroups = await this.groups.findActiveByTeacher(userId);
      if (!teacherGroups.some((g) => g.chatId === student.chatId)) return;
    }
    const updated = await this.presentations.markLatestPendingDone(studentId);
    if (!updated) {
      await ctx.reply(presentationMessages.skipNoPending(student.fullName));
      return;
    }
    this.logger.log(`Presentation ${updated.id} marked done for ${student.id}`);
    await ctx.reply(presentationMessages.skipDone(student.fullName));
  }

  @Command('set_morning')
  async onSetMorning(@Ctx() ctx: Context): Promise<void> {
    await this.handleSetTime(ctx, 'morning');
  }

  @Command('set_evening')
  async onSetEvening(@Ctx() ctx: Context): Promise<void> {
    await this.handleSetTime(ctx, 'evening');
  }

  private async handleSetTime(ctx: Context, kind: 'morning' | 'evening'): Promise<void> {
    const group = await this.resolveGroup(ctx);
    if (!group || !ctx.chat) {
      await ctx.reply(groupMessages.onlyInGroup);
      return;
    }
    if (!(await this.hasGroupAccess(ctx, group))) return;
    const message = ctx.message as { text?: string } | undefined;
    const args = (message?.text ?? '').trim().split(/\s+/).slice(1);
    const cmd = kind === 'morning' ? 'set_morning' : 'set_evening';
    if (args.length === 0) {
      await ctx.reply(groupMessages.setTimeUsage(cmd));
      return;
    }
    if (!TIME_RE.test(args[0])) {
      await ctx.reply(groupMessages.setTimeBadFormat);
      return;
    }
    const time = args[0];
    if (kind === 'morning') {
      await this.groups.updateMorningTime(group.chatId, time);
      await ctx.reply(groupMessages.setMorningOk(time));
    } else {
      await this.groups.updateEveningTime(group.chatId, time);
      await ctx.reply(groupMessages.setEveningOk(time));
    }
    this.logger.log(`Group ${group.chatId} ${kind}_time set to ${time}`);
  }

  @Command('students')
  async onStudents(@Ctx() ctx: Context): Promise<void> {
    const group = await this.resolveGroup(ctx);
    if (!group || !ctx.chat) {
      await ctx.reply(groupMessages.onlyInGroup);
      return;
    }
    if (!(await this.hasGroupAccess(ctx, group))) return;
    const list = await this.students.findByChat(ctx.chat.id);
    if (list.length === 0) {
      await ctx.reply(studentMessages.studentsEmpty);
      return;
    }
    const rows = list.map((s) =>
      studentMessages.studentRow(s.fullName, s.bookTitle, s.currentPage, s.bookTotalPages),
    );
    await ctx.reply(studentMessages.studentsList(rows));
  }
}
