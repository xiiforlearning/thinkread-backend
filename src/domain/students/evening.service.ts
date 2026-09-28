import { Injectable, Logger } from '@nestjs/common';
import { ErrorCode, ErrorLevel, ServiceCode } from '../../common/codes';
import { AppError } from '../../common/errors';
import type { ExerciseType } from '../../common/exercise-type';
import { ReportsService } from '../reports/reports.service';
import type { ParsedWord } from '../words/parsed-word';
import { WordsService } from '../words/words.service';
import { studentMessages } from './messages';
import { StudentState } from './student-state.enum';
import { Student } from './student.entity';
import { StudentsService } from './students.service';

export interface StepResult {
  reply: string;
  /** After saving reading words, ask the optional page step next (handler attaches the Skip keyboard). */
  askPageNext?: boolean;
}

export interface ListeningAnswerResult {
  next: 'listening-words' | 'reading-question';
}

export interface ListeningWordsResult {
  /** Parser produced nothing — re-prompt (student can still press Готово). */
  retry?: boolean;
  savedCount?: number;
}

export interface ReadingWordsResult {
  /** Parser produced nothing — reading words are mandatory, so ask again. */
  needWord?: boolean;
  savedCount?: number;
}

export interface ReadingAnswerResult {
  next: 'reading-words' | 'done';
  /** For the 'done' branch: did the student do anything today at all? */
  anyDone?: boolean;
}

@Injectable()
export class EveningService {
  private readonly logger = new Logger(EveningService.name);

  constructor(
    private readonly students: StudentsService,
    private readonly words: WordsService,
    private readonly reports: ReportsService,
  ) {}

  /**
   * Manual /words entry point. Puts the student in the word-entry state and
   * returns the prompt. Book is not required (v2: reading is a yes/no exercise).
   */
  async startWordsFlow(student: Student): Promise<StepResult> {
    if (student.state !== StudentState.AWAITING_EVENING_WORDS) {
      await this.students.setState(student, StudentState.AWAITING_EVENING_WORDS);
    }
    return { reply: studentMessages.askEveningWords };
  }

  /**
   * Listening answer. If yes → collect optional listening words next; otherwise
   * move straight on to the reading question.
   */
  async handleListeningAnswer(student: Student, did: boolean): Promise<ListeningAnswerResult> {
    await this.reports.recordListening(student.id, did);
    if (did) {
      await this.students.setState(student, StudentState.AWAITING_EVENING_LISTENING_WORDS);
      return { next: 'listening-words' };
    }
    // Stay in the button phase so the reading Да/Нет callback is accepted.
    await this.students.setState(student, StudentState.AWAITING_EVENING_EXERCISES);
    return { next: 'reading-question' };
  }

  /**
   * Add a batch of listening words (accumulates across messages). Empty parse →
   * retry. State stays AWAITING_EVENING_LISTENING_WORDS until the student taps Готово.
   */
  async addListeningWords(student: Student, parsed: ParsedWord[]): Promise<ListeningWordsResult> {
    if (parsed.length === 0) return { retry: true };
    await this.words.insertMany(student.id, parsed, 'listening');
    await this.reports.recordWords(student.id, parsed.length);
    this.logger.log(`Student ${student.id} added ${parsed.length} listening words`);
    return { savedCount: parsed.length };
  }

  /** Finish listening words → move on to the reading question. */
  async finishListeningWords(student: Student): Promise<void> {
    await this.students.setState(student, StudentState.AWAITING_EVENING_EXERCISES);
  }

  /**
   * Reading answer. If yes → mandatory reading words next; otherwise finish the
   * evening (noting whether anything was done today).
   */
  async handleReadingAnswer(student: Student, did: boolean): Promise<ReadingAnswerResult> {
    const row = await this.reports.recordReading(student.id, did);
    if (did) {
      await this.students.setState(student, StudentState.AWAITING_EVENING_WORDS);
      return { next: 'reading-words' };
    }
    await this.students.setState(student, StudentState.IDLE);
    return { next: 'done', anyDone: row.didListening };
  }

  /**
   * Add a batch of reading words (accumulates across messages). Tagged by today's
   * exercise source. Empty parse → retry. State stays AWAITING_EVENING_WORDS until
   * the student taps Готово (finishReadingWords).
   */
  async addReadingWords(student: Student, parsed: ParsedWord[]): Promise<ReadingWordsResult> {
    if (parsed.length === 0) return { needWord: true };
    const report = await this.reports.getOrCreateToday(student.id);
    const exerciseType: ExerciseType = report.didReading ? 'reading' : 'listening';
    await this.words.insertMany(student.id, parsed, exerciseType);
    await this.reports.recordWords(student.id, parsed.length);
    this.logger.log(`Student ${student.id} added ${parsed.length} ${exerciseType} words`);
    return { savedCount: parsed.length };
  }

  /** Finish reading words → optional page step (if a book is set) or done. */
  async finishReadingWords(student: Student): Promise<StepResult> {
    const canAskPage = !!student.bookTitle && student.bookTotalPages !== null;
    if (canAskPage) {
      await this.students.setState(student, StudentState.AWAITING_EVENING_PAGE);
      return { reply: studentMessages.eveningWordsSaved, askPageNext: true };
    }
    await this.students.setState(student, StudentState.IDLE);
    return { reply: studentMessages.eveningWordsSaved };
  }

  /**
   * Parse and store a page update. Validates the range. Updates daily_reports.
   * Returns either an out-of-range retry prompt (state unchanged) or a confirmation.
   * On book completion, appends a congrats line.
   */
  async handlePageInput(student: Student, raw: string): Promise<StepResult> {
    const total = student.bookTotalPages;
    if (total === null || total === undefined) {
      throw new AppError({
        level: ErrorLevel.LOW_BUSINESS,
        service: ServiceCode.STUDENTS,
        error: ErrorCode.INVALID_STATE,
        message: 'bookTotalPages missing on page submission',
        meta: { studentId: student.id },
      });
    }
    const page = parsePositiveInt(raw);
    const min = student.currentPage ?? student.bookStartPage;
    if (page === null || page < min || page > total) {
      return { reply: studentMessages.pageOutOfRange(min, total) };
    }

    const previousPage = student.currentPage ?? student.bookStartPage;
    const delta = page - previousPage;

    student.currentPage = page;
    student.state = StudentState.IDLE;
    await this.students.save(student);
    await this.reports.recordPage(student.id, page, previousPage);

    let reply = studentMessages.pageSaved(page, total, delta);
    if (page >= total) {
      reply += '\n\n' + studentMessages.bookCompleted(student.bookTitle ?? '');
    }
    this.logger.log(`Student ${student.id} updated page to ${page}/${total}`);
    return { reply };
  }

  /** Skip the optional page step → finish the evening. */
  async skipPage(student: Student): Promise<StepResult> {
    await this.students.setState(student, StudentState.IDLE);
    return { reply: studentMessages.eveningPageSkipped };
  }

  // Interactive /add flow ---------------------------------------------------

  async startInteractiveAdd(student: Student): Promise<StepResult> {
    if (!student.bookTitle) {
      return { reply: studentMessages.bookNotSetYet };
    }
    // Block only mid-registration (partial book data would be lost).
    if (
      student.state === StudentState.AWAITING_BOOK_TITLE ||
      student.state === StudentState.AWAITING_BOOK_TOTAL_PAGES ||
      student.state === StudentState.AWAITING_BOOK_START_PAGE
    ) {
      return { reply: studentMessages.addBusyBookRegistration };
    }
    // Evening flow is abandoned-by-intent — silently cancel it.
    const interrupted =
      student.state === StudentState.AWAITING_EVENING_WORDS ||
      student.state === StudentState.AWAITING_EVENING_PAGE;
    if (interrupted) {
      this.logger.log(`Student ${student.id} cancelled ${student.state} via /add`);
    }
    student.state = StudentState.AWAITING_NEW_WORD;
    student.pendingWord = null;
    student.interactiveStartedAt = new Date();
    await this.students.save(student);
    this.logger.log(`Student ${student.id} started interactive /add session`);
    return { reply: studentMessages.addStarted };
  }

  async handleNewWordInput(student: Student, raw: string): Promise<StepResult> {
    const text = raw.trim();
    if (text.length === 0) {
      return { reply: studentMessages.addEmpty };
    }
    student.pendingWord = text;
    student.state = StudentState.AWAITING_NEW_TRANSLATION;
    await this.students.save(student);
    return { reply: studentMessages.addAwaitTranslation(text) };
  }

  async handleNewTranslationInput(student: Student, raw: string): Promise<StepResult> {
    const translation = raw.trim();
    if (translation.length === 0) {
      return { reply: studentMessages.addEmpty };
    }
    if (!student.pendingWord) {
      // Out of sync — reset to word stage.
      student.state = StudentState.AWAITING_NEW_WORD;
      await this.students.save(student);
      return { reply: studentMessages.addLostWord };
    }
    const word = student.pendingWord;
    await this.words.insertMany(student.id, [{ word, translation }]);
    await this.reports.recordWords(student.id, 1);
    student.pendingWord = null;
    student.state = StudentState.AWAITING_NEW_WORD;
    await this.students.save(student);
    this.logger.log(`Student ${student.id} added word "${word}" interactively`);
    return { reply: studentMessages.addSaved(word, translation) };
  }

  async finishInteractiveAdd(student: Student): Promise<StepResult> {
    if (
      student.state !== StudentState.AWAITING_NEW_WORD &&
      student.state !== StudentState.AWAITING_NEW_TRANSLATION
    ) {
      return { reply: studentMessages.addNotInSession };
    }
    let count = 0;
    if (student.interactiveStartedAt) {
      count = await this.words.countAddedSince(student.id, student.interactiveStartedAt);
    }
    student.state = StudentState.IDLE;
    student.pendingWord = null;
    student.interactiveStartedAt = null;
    await this.students.save(student);
    this.logger.log(`Student ${student.id} finished interactive /add (${count} words)`);
    return { reply: studentMessages.addFinished(count) };
  }
}

function parsePositiveInt(raw: string): number | null {
  const trimmed = raw.trim().replace(/\s+/g, '');
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return null;
  return n;
}
