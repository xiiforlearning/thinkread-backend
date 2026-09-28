import { Injectable, Logger } from '@nestjs/common';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf } from 'telegraf';
import { globalConfig } from '../../config/global.config';
import { ReportsService } from '../../domain/reports/reports.service';
import { StudentState } from '../../domain/students/student-state.enum';
import { Student } from '../../domain/students/student.entity';
import { StudentsService } from '../../domain/students/students.service';
import { wordMessages } from '../../domain/words/messages';
import { isRecallCorrect } from '../../domain/words/recall';
import { Word } from '../../domain/words/word.entity';
import { WordsService } from '../../domain/words/words.service';
import { buildRevealKeyboard, buildSessionSizeKeyboard } from '../bot/utils/flashcard-keyboard';

/**
 * Shared logic for starting a review session and rendering cards.
 * Lives in its own module so both the morning cron (SchedulerService) and the
 * /review command (FlashcardHandler) can call it without a circular import.
 */
@Injectable()
export class ReviewService {
  private readonly logger = new Logger(ReviewService.name);

  constructor(
    @InjectBot() private readonly bot: Telegraf,
    private readonly words: WordsService,
    private readonly students: StudentsService,
    private readonly reports: ReportsService,
  ) {}

  /**
   * High-level entry for /review and the morning cron.
   * - 0 due → tells the student there's nothing
   * - 1–defaultSessionSize → auto-start with all of them
   * - more → sends the chooser inline keyboard
   */
  async presentSessionStart(chatId: number, studentId: string): Promise<void> {
    const due = await this.words.countDue(studentId);
    if (due === 0) {
      await this.safeSend(chatId, wordMessages.reviewNothingDue);
      return;
    }
    const { defaultSessionSize, sessionSizeOptions } = globalConfig.spacedRepetition;
    if (due <= defaultSessionSize) {
      await this.startSession(chatId, studentId, due);
      return;
    }
    const sizes = sessionSizeOptions.filter((s) => s < due);
    await this.safeSend(chatId, wordMessages.reviewChoose(due), {
      reply_markup: buildSessionSizeKeyboard(sizes, due),
    });
  }

  /**
   * Send intro + first card. `size` = how many cards the user committed to in
   * this session (≤ due count). Returns the size (0 if nothing due).
   */
  async startSession(chatId: number, studentId: string, size: number): Promise<number> {
    if (size <= 0) {
      await this.safeSend(chatId, wordMessages.reviewNothingDue);
      return 0;
    }
    const first = await this.words.findDue(studentId, 1);
    if (first.length === 0) {
      await this.safeSend(chatId, wordMessages.reviewNothingDue);
      return 0;
    }
    await this.safeSend(chatId, wordMessages.reviewIntro(size));
    await this.sendCard(chatId, first[0], size - 1);
    return size;
  }

  /**
   * Send a single card. `remaining` is how many cards are left in the session
   * AFTER this one is answered.
   *
   * A brand-new word (reviewCount === 0) is the student's own recently-added
   * word — instead of a self-rated reveal card, it becomes an objective typed
   * reverse-recall (the anti-AI self-check). Older cards use the reveal keyboard.
   */
  async sendCard(chatId: number, word: Word, remaining: number): Promise<void> {
    if (word.reviewCount === 0) {
      await this.students.setPendingRecall(word.studentId, word.id, remaining);
      await this.safeSend(chatId, wordMessages.recallPrompt(word.translation));
      return;
    }
    await this.safeSend(chatId, wordMessages.cardFront(word.word), {
      reply_markup: buildRevealKeyboard(word.id, remaining),
    });
  }

  /**
   * Handle a typed answer to a morning self-check. Grades it, updates SM-2 and
   * the day's first-check tally, then continues the session with the next card.
   */
  async handleRecallAnswer(student: Student, text: string): Promise<void> {
    const wordId = student.pendingReviewWordId;
    const remaining = student.pendingReviewRemaining ?? 0;

    // Clear the pending state up-front; sendCard re-arms it if the next card is
    // also a recall card.
    student.state = StudentState.IDLE;
    student.pendingReviewWordId = null;
    student.pendingReviewRemaining = null;
    await this.students.save(student);

    if (!wordId) return;
    const word = await this.words.findById(wordId);
    if (!word || word.studentId !== student.id) return;

    const correct = isRecallCorrect(word.word, text);
    if (correct) {
      await this.words.applyKnewAnswer(word);
    } else {
      await this.words.applyNopeAnswer(word);
    }
    await this.reports.recordReview(word.studentId);
    await this.reports.recordFirstCheck(word.studentId, correct);

    const chatId = student.telegramUserId;
    await this.safeSend(
      chatId,
      correct
        ? wordMessages.recallCorrect(word.word, word.translation)
        : wordMessages.recallWrong(word.word, word.translation),
    );

    if (remaining <= 0) {
      await this.safeSend(chatId, wordMessages.reviewDoneNoMore);
      return;
    }
    const next = await this.words.findNextDueExcept(word.studentId, word.id);
    if (!next) {
      await this.safeSend(chatId, wordMessages.reviewDoneNoMore);
      return;
    }
    await this.sendCard(chatId, next, remaining - 1);
  }

  private async safeSend(
    chatId: number,
    text: string,
    extra?: Parameters<Telegraf['telegram']['sendMessage']>[2],
  ): Promise<void> {
    try {
      await this.bot.telegram.sendMessage(chatId, text, extra);
    } catch (err) {
      const description = (err as { description?: string }).description ?? (err as Error).message;
      this.logger.warn(`sendMessage to ${chatId} failed: ${description}`);
    }
  }
}
