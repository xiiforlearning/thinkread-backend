import { Logger } from '@nestjs/common';
import { Command, Ctx, Update } from 'nestjs-telegraf';
import { Context } from 'telegraf';
import { Message } from 'telegraf/types';
import { AppConfigService } from '../../../config/config.service';
import { globalConfig } from '../../../config/global.config';
import { GroupsService } from '../../../domain/groups/groups.service';
import { groupMessages } from '../../../domain/groups/messages';
import { reportMessages } from '../../../domain/reports/messages';
import { StudentDetailBuilderService } from '../../report-builder/student-detail-builder.service';
import { WeekMode, WeeklyReportBuilderService } from '../../report-builder/weekly-report-builder.service';
import { TeacherResolverService } from '../../teacher/teacher-resolver.service';
import { splitByNewlines } from '../utils/split-message';

/** Teacher/admin reporting commands: /report (weekly grid) and /student (detail). */
@Update()
export class ReportHandler {
  private readonly logger = new Logger(ReportHandler.name);

  constructor(
    private readonly config: AppConfigService,
    private readonly groups: GroupsService,
    private readonly teacher: TeacherResolverService,
    private readonly weekly: WeeklyReportBuilderService,
    private readonly detail: StudentDetailBuilderService,
  ) {}

  @Command('report')
  async onReport(@Ctx() ctx: Context): Promise<void> {
    const userId = ctx.from?.id;
    if (!userId) return;
    const arg = this.args(ctx)[0]?.toLowerCase();
    const mode: WeekMode = arg === 'last' ? 'lastComplete' : 'toDate';

    let chunks: string[];
    const chatType = ctx.chat?.type;
    if (chatType === 'group' || chatType === 'supergroup') {
      const group = await this.groups.findById(ctx.chat!.id);
      if (!group) {
        await ctx.reply(groupMessages.onlyInGroup);
        return;
      }
      if (!(await this.hasGroupAccess(userId, group.chatId))) return;
      chunks = await this.weekly.buildForGroupChat(group.chatId, mode);
    } else if (chatType === 'private') {
      if (this.config.isSuperAdmin(userId)) {
        chunks = await this.weekly.buildForAllActive(mode);
      } else if (await this.teacher.isTeacherInAnyActiveGroup(userId)) {
        chunks = await this.weekly.buildForTeacher(userId, mode);
      } else {
        return;
      }
    } else {
      return;
    }
    await this.send(ctx, chunks);
  }

  @Command('student')
  async onStudent(@Ctx() ctx: Context): Promise<void> {
    const userId = ctx.from?.id;
    if (!userId) return;

    // Parse args: trailing "last" (or "week") is a mode; the rest is the query.
    const args = this.args(ctx);
    let mode: WeekMode = 'toDate';
    if (args.length && ['last', 'week'].includes(args[args.length - 1].toLowerCase())) {
      mode = args.pop()!.toLowerCase() === 'last' ? 'lastComplete' : 'toDate';
    }
    const query = args.join(' ').trim();

    // Resolve accessible group chats.
    const chatType = ctx.chat?.type;
    let chatIds: number[];
    if (chatType === 'group' || chatType === 'supergroup') {
      const group = await this.groups.findById(ctx.chat!.id);
      if (!group || !(await this.hasGroupAccess(userId, group.chatId))) {
        if (!group) await ctx.reply(groupMessages.onlyInGroup);
        return;
      }
      chatIds = [group.chatId];
    } else if (chatType === 'private') {
      chatIds = await this.accessibleChatIdsInDm(userId);
      if (chatIds.length === 0) return; // no access — silent
    } else {
      return;
    }

    if (!query) {
      await ctx.reply(reportMessages.detailUsage);
      return;
    }

    const resolution = await this.detail.resolve(query, chatIds);
    if (resolution.candidates) {
      const rows = resolution.candidates.map((s) => `• ${s.fullName} — /student ${s.id.slice(0, 8)}`);
      await ctx.reply(reportMessages.detailAmbiguous(rows));
      return;
    }
    if (!resolution.student) {
      await ctx.reply(reportMessages.detailNotFound);
      return;
    }
    const text = await this.detail.buildDetail(resolution.student, mode);
    await this.send(ctx, [text]);
  }

  /** Access: super-admin or a teacher of the given group. */
  private async hasGroupAccess(userId: number, chatId: number): Promise<boolean> {
    if (this.config.isSuperAdmin(userId)) return true;
    return this.teacher.isTeacherInGroup(userId, chatId);
  }

  private async accessibleChatIdsInDm(userId: number): Promise<number[]> {
    if (this.config.isSuperAdmin(userId)) {
      return (await this.groups.findAllActive()).map((g) => g.chatId);
    }
    return (await this.groups.findActiveByTeacher(userId)).map((g) => g.chatId);
  }

  private args(ctx: Context): string[] {
    const message = ctx.message as Message.TextMessage | undefined;
    return (message?.text ?? '').trim().split(/\s+/).slice(1);
  }

  private async send(ctx: Context, chunks: string[]): Promise<void> {
    for (const chunk of chunks) {
      for (const part of splitByNewlines(chunk, globalConfig.reports.maxMessageLength)) {
        try {
          await ctx.reply(part, {
            parse_mode: 'HTML',
            link_preview_options: { is_disabled: true },
          });
        } catch (err) {
          const description =
            (err as { description?: string }).description ?? (err as Error).message;
          this.logger.warn(`report send failed: ${description}`);
        }
      }
    }
  }
}
