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
import { EnrichmentService } from '../../domain/ai/enrichment.service';
import { importKeyboard } from '../../domain/ai/tools/vocabulary.tools';
import { wordMessages } from '../../domain/words/messages';
import { lemmaOf } from '../../domain/words/normalize';
import { WordImportsService } from '../../domain/words/word-imports.service';
import { TeacherResolverService } from '../teacher/teacher-resolver.service';
import { isWordFile, MAX_WORD_FILE_BYTES, parseWordFile } from './utils/word-file';

const LEVEL_ACTION = /^level:(-?\d+):([A-Z_]+)$/;
const IMPORT_ACTION = /^wimport:(ok|no):([0-9a-f-]{36})$/;

type ActionContext = Context & { match: RegExpExecArray };

function toKeyboard(
  rows: Array<Array<{ text: string; callbackData: string }>> | undefined,
): ReturnType<typeof Markup.inlineKeyboard> | undefined {
  return rows
    ? Markup.inlineKeyboard(
        rows.map((row) => row.map((b) => Markup.button.callback(b.text, b.callbackData))),
      )
    : undefined;
}

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
    private readonly imports: WordImportsService,
    private readonly enrichment: EnrichmentService,
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
      await ctx.reply(reply.text, toKeyboard(reply.keyboard));
      if (reply.document) {
        await ctx.replyWithDocument({
          source: Buffer.from(reply.document.content, 'utf8'),
          filename: reply.document.filename,
        });
      }
    } catch (err) {
      const code = err instanceof AppError ? err.code : 'unknown';
      this.logger.error(`AI turn failed for ${ctx.from.id}: ${code} ${(err as Error).message}`);
      await ctx.reply(aiMessages.unavailable);
    }
  }

  // --- vocabulary: files and import confirmation ----------------------------

  /** A .txt / .csv / .xlsx list of words → preview with confirm / cancel buttons. */
  @On('document')
  async onDocument(@Ctx() ctx: Context): Promise<void> {
    if (ctx.chat?.type !== 'private' || !ctx.from || ctx.from.is_bot) return;
    const doc = ctx.message && 'document' in ctx.message ? ctx.message.document : undefined;
    if (!doc) return;

    const gate = await this.registration.gate(
      { telegramUserId: ctx.from.id, username: ctx.from.username ?? null },
      '',
    );
    if (gate.kind === 'reply') {
      await ctx.reply(gate.text);
      return;
    }
    if (!isWordFile(doc.file_name) || (doc.file_size ?? 0) > MAX_WORD_FILE_BYTES) {
      await ctx.reply(wordMessages.fileUnsupported);
      return;
    }
    try {
      const link = await ctx.telegram.getFileLink(doc.file_id);
      const data = Buffer.from(await (await fetch(link.href)).arrayBuffer());
      const parsed = parseWordFile(doc.file_name ?? 'words.txt', data);
      if (parsed.length === 0) {
        await ctx.reply(wordMessages.fileEmpty);
        return;
      }
      const preview = await this.imports.createPreview(gate.student, parsed);
      await ctx.reply(
        wordMessages.importPreview(preview.found, preview.duplicates, preview.toAdd),
        preview.toAdd > 0 ? toKeyboard(importKeyboard(preview.importId, preview.toAdd)) : undefined,
      );
    } catch (err) {
      this.logger.error(`word file import failed for ${ctx.from.id}: ${(err as Error).message}`);
      await ctx.reply(aiMessages.unavailable);
    }
  }

  @Action(IMPORT_ACTION)
  async onImportDecision(@Ctx() ctx: ActionContext): Promise<void> {
    const decision = ctx.match[1];
    const importId = ctx.match[2];
    const student = ctx.from ? await this.students.findByTelegramId(ctx.from.id) : null;
    if (!student) {
      await ctx.answerCbQuery(wordMessages.importNotYours, { show_alert: true });
      return;
    }
    try {
      if (decision === 'ok') {
        const result = await this.imports.confirm(importId, student);
        if (result.added.length > 0) {
          this.enrichment.enrichLater(
            result.added.map((w) => w.lemma ?? lemmaOf(w.word)),
            student.id,
          );
        }
        await ctx.answerCbQuery();
        await ctx
          .editMessageText(wordMessages.importConfirmed(result.added.length))
          .catch(() => undefined);
      } else {
        await this.imports.cancel(importId, student);
        await ctx.answerCbQuery();
        await ctx.editMessageText(wordMessages.importCancelled).catch(() => undefined);
      }
    } catch (err) {
      const code = err instanceof AppError ? err.code : 'unknown';
      this.logger.warn(`import ${decision} failed for ${student.id}: ${code}`);
      await ctx.answerCbQuery(wordMessages.importExpired, { show_alert: true });
      await ctx.editMessageReplyMarkup(undefined).catch(() => undefined);
    }
  }
}
