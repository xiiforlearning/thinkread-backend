import { Logger } from '@nestjs/common';
import { Action, Ctx, Next, On, Start, Update, Use } from 'nestjs-telegraf';
import { Context, Markup } from 'telegraf';
import { AppError } from '../../common/errors';
import { AccessService } from '../../domain/admins/access.service';
import { AgentService } from '../../domain/ai/agent.service';
import { aiMessages } from '../../domain/ai/messages';
import { GroupsService } from '../../domain/groups/groups.service';
import { GROUP_LEVELS, GroupLevel } from '../../domain/groups/level';
import { LEVEL_LABELS, groupMessages } from '../../domain/groups/messages';
import { RegistrationService } from '../../domain/students/registration.service';
import { StudentsService } from '../../domain/students/students.service';
import { TeacherResolverService } from '../teacher/teacher-resolver.service';

const LEVEL_ACTION = /^level:(-?\d+):([A-Z_]+)$/;

type ActionContext = Context & { match: RegExpExecArray };

@Update()
export class BotUpdate {
  private readonly logger = new Logger(BotUpdate.name);

  constructor(
    private readonly groups: GroupsService,
    private readonly students: StudentsService,
    private readonly teacher: TeacherResolverService,
    private readonly access: AccessService,
    private readonly registration: RegistrationService,
    private readonly agent: AgentService,
  ) {}

  @Use()
  async logEveryUpdate(@Ctx() ctx: Context, @Next() next: () => Promise<void>): Promise<void> {
    // Message text is never logged: students' reports are personal data.
    this.logger.log(
      `update type=${ctx.updateType} chat=${ctx.chat?.id ?? '-'}(${ctx.chat?.type ?? '-'}) from=${ctx.from?.id ?? '-'}`,
    );
    if (ctx.from && ctx.chat?.type === 'private') {
      await this.students.clearDmBlockedByTelegramId(ctx.from.id).catch((err: Error) => {
        this.logger.warn(`clearDmBlocked failed: ${err.message}`);
      });
    }
    return next();
  }

  // --- groups ---------------------------------------------------------------

  @On('my_chat_member')
  async onMyChatMember(@Ctx() ctx: Context): Promise<void> {
    const update = ctx.myChatMember;
    if (!update) return;

    const chat = update.chat;
    if (chat.type !== 'group' && chat.type !== 'supergroup') return;

    const newStatus = update.new_chat_member.status;
    const oldStatus = update.old_chat_member.status;

    if (newStatus === 'left' || newStatus === 'kicked') {
      this.logger.log(`Bot removed from group ${chat.id} (${oldStatus} → ${newStatus})`);
      await this.groups.deactivate(chat.id);
      return;
    }

    if (newStatus !== 'member' && newStatus !== 'administrator') return;
    if (oldStatus === 'member' || oldStatus === 'administrator') return;

    const title = 'title' in chat ? chat.title : 'Untitled';
    this.logger.log(`Bot added to group ${chat.id} "${title}" by user ${update.from.id}`);

    const group = await this.groups.upsert(chat.id, title);
    await this.teacher.refresh(chat.id).catch(() => undefined);

    // The level is bound to the chat id, so a re-added group keeps it.
    if (group.level === null) await this.askOwnerForLevel(ctx, chat.id, title);
  }

  private async askOwnerForLevel(ctx: Context, chatId: number, title: string): Promise<void> {
    const keyboard = Markup.inlineKeyboard(
      GROUP_LEVELS.map((level) =>
        Markup.button.callback(LEVEL_LABELS[level], `level:${chatId}:${level}`),
      ),
      { columns: 2 },
    );
    try {
      await ctx.telegram.sendMessage(
        this.access.ownerTelegramId,
        groupMessages.askLevel(title),
        keyboard,
      );
    } catch (err) {
      // The owner must have started the bot in DM first — a warning, not an error.
      this.logger.warn(
        `Could not ask the owner for the level of ${chatId}: ${(err as Error).message}`,
      );
    }
  }

  @Action(LEVEL_ACTION)
  async onLevelChosen(@Ctx() ctx: ActionContext): Promise<void> {
    const chatId = Number(ctx.match[1]);
    const level = ctx.match[2] as GroupLevel;
    if (!GROUP_LEVELS.includes(level) || !ctx.from) {
      await ctx.answerCbQuery();
      return;
    }
    if (!(await this.access.isOwner(ctx.from.id))) {
      await ctx.answerCbQuery(groupMessages.notOwner, { show_alert: true });
      return;
    }
    const group = await this.groups.findById(chatId);
    if (!group) {
      await ctx.answerCbQuery(groupMessages.levelUnknownGroup, { show_alert: true });
      return;
    }

    await this.groups.setLevel(chatId, level);
    this.logger.log(`Group ${chatId} level set to ${level} by ${ctx.from.id}`);
    await ctx.answerCbQuery();
    await ctx.editMessageText(groupMessages.levelSet(group.title, level)).catch(() => undefined);
  }

  // --- private chat ---------------------------------------------------------

  @Start()
  async onStart(@Ctx() ctx: Context): Promise<void> {
    return this.onText(ctx);
  }

  @On('text')
  async onText(@Ctx() ctx: Context): Promise<void> {
    if (ctx.chat?.type !== 'private' || !ctx.from || ctx.from.is_bot) return;
    const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
    // A forwarded report is an authenticity signal (recorded quietly, never mentioned).
    const forwarded =
      ctx.message !== undefined &&
      'forward_origin' in ctx.message &&
      ctx.message.forward_origin !== undefined;

    const gate = await this.registration.gate(
      { telegramUserId: ctx.from.id, username: ctx.from.username ?? null },
      text,
    );
    if (gate.kind === 'reply') {
      await ctx.reply(gate.text);
      return;
    }

    try {
      const reply = await this.agent.handle(gate.student, text, new Date(), { forwarded });
      const keyboard = reply.keyboard
        ? Markup.inlineKeyboard(
            reply.keyboard.map((row) =>
              row.map((b) => Markup.button.callback(b.text, b.callbackData)),
            ),
          )
        : undefined;
      await ctx.reply(reply.text, keyboard);
    } catch (err) {
      const code = err instanceof AppError ? err.code : 'unknown';
      this.logger.error(`AI turn failed for ${ctx.from.id}: ${code} ${(err as Error).message}`);
      await ctx.reply(aiMessages.unavailable);
    }
  }
}
