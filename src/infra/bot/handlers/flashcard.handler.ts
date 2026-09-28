import { Logger } from '@nestjs/common';
import { Action, Command, Ctx, Update } from 'nestjs-telegraf';
import { Context } from 'telegraf';
import { ReportsService } from '../../../domain/reports/reports.service';
import { studentMessages } from '../../../domain/students/messages';
import { StudentsService } from '../../../domain/students/students.service';
import { wordMessages } from '../../../domain/words/messages';
import { Word } from '../../../domain/words/word.entity';
import { WordsService } from '../../../domain/words/words.service';
import { ReviewService } from '../../review/review.service';
import { buildAnswerKeyboard } from '../utils/flashcard-keyboard';

interface MatchedContext extends Context {
  match: RegExpExecArray;
}

@Update()
export class FlashcardHandler {
  private readonly logger = new Logger(FlashcardHandler.name);

  constructor(
    private readonly students: StudentsService,
    private readonly words: WordsService,
    private readonly review: ReviewService,
    private readonly reports: ReportsService,
  ) {}

  @Command('review')
  async onReview(@Ctx() ctx: Context): Promise<void> {
    if (ctx.chat?.type !== 'private' || !ctx.from) return;
    const student = await this.students.findByTelegramId(ctx.from.id);
    if (!student) {
      await ctx.reply(studentMessages.notRegistered);
      return;
    }
    if (!student.bookTitle) {
      await ctx.reply(studentMessages.bookNotSetYet);
      return;
    }
    await this.review.presentSessionStart(ctx.chat.id, student.id);
  }

  @Action(/^review:open$/)
  async onReviewOpen(@Ctx() ctx: Context): Promise<void> {
    if (!ctx.from || !ctx.chat) return;
    const student = await this.students.findByTelegramId(ctx.from.id);
    if (!student) {
      await ctx.answerCbQuery(studentMessages.notRegistered);
      return;
    }
    await ctx.answerCbQuery();
    // Remove the morning button so it can't be re-pressed.
    try {
      await ctx.editMessageReplyMarkup(undefined);
    } catch {
      // already edited — ignore
    }
    await this.review.presentSessionStart(ctx.chat.id, student.id);
  }

  @Action(/^review:start:(\d+)$/)
  async onStartSize(@Ctx() ctx: MatchedContext): Promise<void> {
    if (!ctx.from || !ctx.chat) return;
    const size = Number(ctx.match[1]);
    const student = await this.students.findByTelegramId(ctx.from.id);
    if (!student) {
      await ctx.answerCbQuery(studentMessages.notRegistered);
      return;
    }
    await ctx.answerCbQuery();
    // Remove the chooser's keyboard so it can't be re-pressed.
    if (ctx.callbackQuery && 'message' in ctx.callbackQuery && ctx.callbackQuery.message) {
      try {
        await ctx.editMessageReplyMarkup(undefined);
      } catch {
        // chooser might have already been edited — ignore
      }
    }
    await this.review.startSession(ctx.chat.id, student.id, size);
  }

  @Action(/^card:reveal:([0-9a-f-]{36}):(\d+)$/)
  async onReveal(@Ctx() ctx: MatchedContext): Promise<void> {
    const wordId = ctx.match[1];
    const remaining = Number(ctx.match[2]);
    const word = await this.words.findById(wordId);
    if (!word) {
      await ctx.answerCbQuery(wordMessages.cardNotFound);
      return;
    }
    if (!(await this.assertOwnership(ctx, word))) return;
    await ctx.answerCbQuery();
    await ctx.editMessageText(wordMessages.cardRevealed(word.word, word.translation), {
      reply_markup: buildAnswerKeyboard(word.id, remaining),
    });
  }

  @Action(/^card:know:([0-9a-f-]{36}):(\d+)$/)
  async onKnew(@Ctx() ctx: MatchedContext): Promise<void> {
    await this.handleAnswer(ctx, 'knew');
  }

  @Action(/^card:nope:([0-9a-f-]{36}):(\d+)$/)
  async onNope(@Ctx() ctx: MatchedContext): Promise<void> {
    await this.handleAnswer(ctx, 'nope');
  }

  private async handleAnswer(ctx: MatchedContext, kind: 'knew' | 'nope'): Promise<void> {
    const wordId = ctx.match[1];
    const remaining = Number(ctx.match[2]);
    const word = await this.words.findById(wordId);
    if (!word) {
      await ctx.answerCbQuery(wordMessages.cardNotFound);
      return;
    }
    if (!(await this.assertOwnership(ctx, word))) return;

    if (kind === 'knew') {
      await this.words.applyKnewAnswer(word);
    } else {
      await this.words.applyNopeAnswer(word);
    }
    await this.reports.recordReview(word.studentId);
    await ctx.answerCbQuery();

    const text =
      kind === 'knew'
        ? wordMessages.cardAnsweredKnew(word.word, word.translation)
        : wordMessages.cardAnsweredNope(word.word, word.translation);
    await ctx.editMessageText(text);

    if (!ctx.chat) return;
    if (remaining <= 0) {
      await ctx.telegram.sendMessage(ctx.chat.id, wordMessages.reviewDoneNoMore);
      return;
    }

    const next = await this.words.findNextDueExcept(word.studentId, word.id);
    if (!next) {
      await ctx.telegram.sendMessage(ctx.chat.id, wordMessages.reviewDoneNoMore);
      return;
    }
    await this.review.sendCard(ctx.chat.id, next, remaining - 1);
  }

  private async assertOwnership(ctx: MatchedContext, word: Word): Promise<boolean> {
    if (!ctx.from) {
      await ctx.answerCbQuery(wordMessages.notYourCard);
      return false;
    }
    const student = await this.students.findByTelegramId(ctx.from.id);
    if (!student || student.id !== word.studentId) {
      await ctx.answerCbQuery(wordMessages.notYourCard);
      this.logger.warn(
        `User ${ctx.from.id} tried to act on word ${word.id} owned by student ${word.studentId}`,
      );
      return false;
    }
    return true;
  }
}
