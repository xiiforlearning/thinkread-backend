import { Logger } from '@nestjs/common';
import { Command, Ctx, Next, On, Update } from 'nestjs-telegraf';
import { Context } from 'telegraf';
import { Message } from 'telegraf/types';
import { AppError } from '../../../common/errors';
import { ReportsService } from '../../../domain/reports/reports.service';
import { EveningService } from '../../../domain/students/evening.service';
import { studentMessages } from '../../../domain/students/messages';
import { StudentState } from '../../../domain/students/student-state.enum';
import { StudentsService } from '../../../domain/students/students.service';
import { ReviewService } from '../../review/review.service';
import {
  buildDoneListeningKeyboard,
  buildDoneReadingKeyboard,
} from '../utils/evening-keyboard';
import { parseWords } from '../utils/word-parser';

/**
 * Anti-AI hard signal: the word list arrived as a forward or via an inline bot.
 * `forward_origin` (Bot API 7+) / legacy `forward_date` mark forwards; `via_bot`
 * marks inline-bot output. Cast to read fields not on the base text-message type.
 */
function isForwardedOrViaBot(message: Message.TextMessage): boolean {
  const m = message as Message.TextMessage & {
    forward_origin?: unknown;
    forward_date?: number;
    via_bot?: unknown;
  };
  return Boolean(m.forward_origin || m.forward_date || m.via_bot);
}

@Update()
export class EveningHandler {
  private readonly logger = new Logger(EveningHandler.name);

  constructor(
    private readonly students: StudentsService,
    private readonly evening: EveningService,
    private readonly reports: ReportsService,
    private readonly review: ReviewService,
  ) {}

  @Command('words')
  async onWordsCommand(@Ctx() ctx: Context): Promise<void> {
    if (ctx.chat?.type !== 'private' || !ctx.from) return;
    const student = await this.students.findByTelegramId(ctx.from.id);
    if (!student) {
      await ctx.reply(studentMessages.notRegistered);
      return;
    }
    try {
      const result = await this.evening.startWordsFlow(student);
      await ctx.reply(result.reply);
    } catch (err) {
      await this.handleError(ctx, err);
    }
  }

  @Command('add')
  async onAddCommand(@Ctx() ctx: Context): Promise<void> {
    if (ctx.chat?.type !== 'private' || !ctx.from) return;
    const student = await this.students.findByTelegramId(ctx.from.id);
    if (!student) {
      await ctx.reply(studentMessages.notRegistered);
      return;
    }
    try {
      const result = await this.evening.startInteractiveAdd(student);
      await ctx.reply(result.reply);
    } catch (err) {
      await this.handleError(ctx, err);
    }
  }

  @Command('done')
  async onDoneCommand(@Ctx() ctx: Context): Promise<void> {
    if (ctx.chat?.type !== 'private' || !ctx.from) return;
    const student = await this.students.findByTelegramId(ctx.from.id);
    if (!student) {
      await ctx.reply(studentMessages.notRegistered);
      return;
    }
    try {
      const result = await this.evening.finishInteractiveAdd(student);
      await ctx.reply(result.reply);
    } catch (err) {
      await this.handleError(ctx, err);
    }
  }

  @Command('page')
  async onPageCommand(@Ctx() ctx: Context): Promise<void> {
    if (ctx.chat?.type !== 'private' || !ctx.from) return;
    const student = await this.students.findByTelegramId(ctx.from.id);
    if (!student) {
      await ctx.reply(studentMessages.notRegistered);
      return;
    }
    if (!student.bookTitle || !student.bookTotalPages) {
      await ctx.reply(studentMessages.bookNotSetYet);
      return;
    }

    const message = ctx.message as Message.TextMessage | undefined;
    const args = (message?.text ?? '').trim().split(/\s+/).slice(1);
    if (args.length === 0) {
      await ctx.reply(studentMessages.pageUsage);
      return;
    }

    try {
      const result = await this.evening.handlePageInput(student, args[0]);
      await ctx.reply(result.reply);
    } catch (err) {
      await this.handleError(ctx, err);
    }
  }

  /**
   * Plain text routing for AWAITING_EVENING_WORDS / AWAITING_EVENING_PAGE states.
   * Everything else (DM commands, other states, group messages) is forwarded
   * via next() so other handlers/commands can match.
   */
  @On('text')
  async onText(@Ctx() ctx: Context, @Next() next: () => Promise<void>): Promise<void> {
    if (ctx.chat?.type !== 'private' || !ctx.from) return next();
    const message = ctx.message as Message.TextMessage | undefined;
    if (!message?.text || message.text.startsWith('/')) return next();

    const student = await this.students.findByTelegramId(ctx.from.id);
    if (!student) return next();

    try {
      if (student.state === StudentState.AWAITING_RECALL_ANSWER) {
        await this.review.handleRecallAnswer(student, message.text);
        return;
      }
      if (student.state === StudentState.AWAITING_EVENING_LISTENING_WORDS) {
        if (isForwardedOrViaBot(message)) {
          await this.reports.markWordsForwarded(student.id);
        }
        const parsed = parseWords(message.text);
        const result = await this.evening.addListeningWords(student, parsed);
        const text = result.retry
          ? studentMessages.askListeningWords
          : studentMessages.eveningWordAccepted(result.savedCount ?? 0);
        await ctx.reply(text, { reply_markup: buildDoneListeningKeyboard() });
        return;
      }
      if (student.state === StudentState.AWAITING_EVENING_WORDS) {
        if (isForwardedOrViaBot(message)) {
          await this.reports.markWordsForwarded(student.id);
        }
        const parsed = parseWords(message.text);
        const result = await this.evening.addReadingWords(student, parsed);
        if (result.needWord) {
          // Mandatory: no Готово button until at least one word is accepted.
          await ctx.reply(studentMessages.eveningReadingNeedWord);
          return;
        }
        await ctx.reply(studentMessages.eveningWordAccepted(result.savedCount ?? 0), {
          reply_markup: buildDoneReadingKeyboard(),
        });
        return;
      }
      if (student.state === StudentState.AWAITING_EVENING_PAGE) {
        const result = await this.evening.handlePageInput(student, message.text);
        await ctx.reply(result.reply);
        return;
      }
      if (student.state === StudentState.AWAITING_NEW_WORD) {
        const result = await this.evening.handleNewWordInput(student, message.text);
        await ctx.reply(result.reply);
        return;
      }
      if (student.state === StudentState.AWAITING_NEW_TRANSLATION) {
        const result = await this.evening.handleNewTranslationInput(student, message.text);
        await ctx.reply(result.reply);
        return;
      }
      // Other states (registration flow, IDLE) — pass through to next handler.
      return next();
    } catch (err) {
      await this.handleError(ctx, err);
    }
  }

  private async handleError(ctx: Context, err: unknown): Promise<void> {
    if (err instanceof AppError) {
      this.logger.warn(`AppError [${err.code}]: ${err.message}`);
      await ctx.reply(err.message);
      return;
    }
    this.logger.error('Unhandled error in evening flow', err as Error);
  }
}
