import { Logger } from '@nestjs/common';
import { Action, Ctx, Update } from 'nestjs-telegraf';
import { Context } from 'telegraf';
import { AppError } from '../../../common/errors';
import { EveningService } from '../../../domain/students/evening.service';
import { studentMessages } from '../../../domain/students/messages';
import { StudentState } from '../../../domain/students/student-state.enum';
import { Student } from '../../../domain/students/student.entity';
import { StudentsService } from '../../../domain/students/students.service';
import {
  buildDoneListeningKeyboard,
  buildReadingKeyboard,
  buildSkipPageKeyboard,
} from '../utils/evening-keyboard';

interface MatchedContext extends Context {
  match: RegExpExecArray;
}

/**
 * Evening exercise flow (v2): the listening/reading Да-Нет taps and the Skip
 * buttons. Words are collected per exercise (listening optional, reading
 * mandatory) — the word/page text entry itself is handled by EveningHandler.
 */
@Update()
export class ExercisesHandler {
  private readonly logger = new Logger(ExercisesHandler.name);

  constructor(
    private readonly students: StudentsService,
    private readonly evening: EveningService,
  ) {}

  /** Resolve the acting student, enforcing the expected state. */
  private async resolve(ctx: Context, expected: StudentState): Promise<Student | null> {
    if (!ctx.from) return null;
    const student = await this.students.findByTelegramId(ctx.from.id);
    if (!student || student.state !== expected) {
      await ctx.answerCbQuery(studentMessages.eveningStale);
      return null;
    }
    return student;
  }

  @Action(/^ev:l:([01])$/)
  async onListening(@Ctx() ctx: MatchedContext): Promise<void> {
    const student = await this.resolve(ctx, StudentState.AWAITING_EVENING_EXERCISES);
    if (!student) return;
    const did = ctx.match[1] === '1';
    try {
      await ctx.answerCbQuery();
      await this.safeEdit(ctx, studentMessages.eveningListeningResult(did));
      const result = await this.evening.handleListeningAnswer(student, did);
      if (result.next === 'listening-words') {
        await ctx.reply(studentMessages.askListeningWords, {
          reply_markup: buildDoneListeningKeyboard(),
        });
      } else {
        await this.askReading(ctx);
      }
    } catch (err) {
      this.logger.error(`onListening failed for student ${student.id}`, err as Error);
    }
  }

  @Action(/^ev:donelisten$/)
  async onDoneListening(@Ctx() ctx: MatchedContext): Promise<void> {
    const student = await this.resolve(ctx, StudentState.AWAITING_EVENING_LISTENING_WORDS);
    if (!student) return;
    await ctx.answerCbQuery();
    await this.clearKeyboard(ctx);
    await this.evening.finishListeningWords(student);
    await this.askReading(ctx);
  }

  @Action(/^ev:r:([01])$/)
  async onReading(@Ctx() ctx: MatchedContext): Promise<void> {
    const student = await this.resolve(ctx, StudentState.AWAITING_EVENING_EXERCISES);
    if (!student) return;
    const did = ctx.match[1] === '1';
    try {
      await ctx.answerCbQuery();
      await this.safeEdit(ctx, studentMessages.eveningReadingResult(did));
      const result = await this.evening.handleReadingAnswer(student, did);
      if (result.next === 'reading-words') {
        // No Готово button yet — it appears after the first word is accepted.
        await ctx.reply(studentMessages.askEveningWordsMandatory);
      } else {
        await ctx.reply(result.anyDone ? studentMessages.eveningFinished : studentMessages.eveningNothingToday);
      }
    } catch (err) {
      this.logger.error(`onReading failed for student ${student.id}`, err as Error);
    }
  }

  @Action(/^ev:donereading$/)
  async onDoneReading(@Ctx() ctx: MatchedContext): Promise<void> {
    const student = await this.resolve(ctx, StudentState.AWAITING_EVENING_WORDS);
    if (!student) return;
    await ctx.answerCbQuery();
    await this.clearKeyboard(ctx);
    const result = await this.evening.finishReadingWords(student);
    await ctx.reply(result.reply);
    if (result.askPageNext) {
      await ctx.reply(studentMessages.askEveningPageOptional, {
        reply_markup: buildSkipPageKeyboard(),
      });
    }
  }

  @Action(/^ev:skippage$/)
  async onSkipPage(@Ctx() ctx: MatchedContext): Promise<void> {
    const student = await this.resolve(ctx, StudentState.AWAITING_EVENING_PAGE);
    if (!student) return;
    await ctx.answerCbQuery();
    await this.clearKeyboard(ctx);
    const result = await this.evening.skipPage(student);
    await ctx.reply(result.reply);
  }

  private async askReading(ctx: Context): Promise<void> {
    await ctx.reply(studentMessages.eveningAskReadingQ, { reply_markup: buildReadingKeyboard() });
  }

  private async safeEdit(ctx: Context, text: string): Promise<void> {
    try {
      await ctx.editMessageText(text);
    } catch (err) {
      if (err instanceof AppError) throw err;
      await ctx.reply(text);
    }
  }

  private async clearKeyboard(ctx: Context): Promise<void> {
    try {
      await ctx.editMessageReplyMarkup(undefined);
    } catch {
      // keyboard already gone — ignore
    }
  }
}
