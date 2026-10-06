import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { fromZonedTime } from 'date-fns-tz';
import { In, IsNull, LessThanOrEqual, Repository } from 'typeorm';
import { ErrorCode, ErrorLevel, ServiceCode } from '../../common/codes';
import { AppError } from '../../common/errors';
import { globalConfig } from '../../config/global.config';
import { SentenceCheckService } from '../ai/sentence-check.service';
import { localDay } from '../norms/week';
import { Student } from '../students/student.entity';
import { LexiconService } from '../words/lexicon.service';
import { lemmaOf } from '../words/normalize';
import { WordLexicon } from '../words/word-lexicon.entity';
import { Word } from '../words/word.entity';
import { CardStage, WordPriority, WordStatus } from '../words/word.enums';
import { CardAttempt, CardChannel, CardPrompt } from './card-attempt.entity';
import { cardMessages } from './messages';

const DAY_MS = 86_400_000;

export interface TodayCards {
  /** Answered (right or wrong) today — what the daily norm counts. */
  done: number;
  correct: number;
  norm: number;
}

export interface QueueItem {
  word: Word;
  overdue: boolean;
  reason: 'OVERDUE' | 'PRIORITY' | 'DUE';
}

export interface CardView {
  attemptId: string;
  wordId: string;
  word: string;
  stage: CardStage;
  stageLabel: string;
  question: string;
  /** What the card shows big: the translation (stage 1), nothing (stage 2 — the gap is in the question), the word (stage 3). */
  shown: string | null;
  hint: string | null;
  placeholder: string;
  canGiveUp: boolean;
  today: TodayCards;
}

export interface AnswerResult {
  attemptId: string;
  correct: boolean;
  expected: string;
  message: string;
  feedback: string | null;
  advanced: boolean;
  learned: boolean;
  word: { id: string; stage: CardStage; status: WordStatus; nextDueAt: Date };
  today: TodayCards;
}

/** Lower case, no punctuation, single spaces, no leading "to ". */
export function normalizeAnswer(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'’-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^to\s+/, '');
}

/** Replace the word (or any of its forms) in a sentence with ___. */
export function maskWord(sentence: string, forms: string[]): string | null {
  for (const f of [...forms].sort((a, b) => b.length - a.length)) {
    const re = new RegExp(`\\b${f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (re.test(sentence)) return sentence.replace(re, '___');
  }
  return null;
}

/**
 * Customer rules (30.09.2026): queue = overdue → priority → new; one correct
 * answer per stage, learned after one success on stage 3; intervals 1/3/7
 * days by total correct answers, a mistake means tomorrow and keeps the
 * intervals; at most two stage-3 cards in a row; the norm is `cardsPerDay`
 * answered cards, extra cards still move words along.
 */
@Injectable()
export class CardsService {
  constructor(
    @InjectRepository(CardAttempt)
    private readonly attempts: Repository<CardAttempt>,
    @InjectRepository(Word)
    private readonly words: Repository<Word>,
    private readonly lexicon: LexiconService,
    private readonly sentences: SentenceCheckService,
  ) {}

  /** UTC instant of local midnight — "today" for the norm and the overdue line. */
  private dayStart(now: Date, timeZone: string): Date {
    return fromZonedTime(`${localDay(now, timeZone)}T00:00:00`, timeZone);
  }

  async today(studentId: string, now: Date, timeZone: string): Promise<TodayCards> {
    const rows = await this.attempts
      .createQueryBuilder('a')
      .select('COUNT(*)', 'done')
      .addSelect('COUNT(*) FILTER (WHERE a.is_correct = TRUE)', 'correct')
      .where('a.student_id = :studentId', { studentId })
      .andWhere('a.is_correct IS NOT NULL')
      .andWhere('a.created_at >= :from', { from: this.dayStart(now, timeZone) })
      .getRawOne<{ done: string; correct: string }>();
    return {
      done: Number(rows?.done ?? 0),
      correct: Number(rows?.correct ?? 0),
      norm: globalConfig.norms.cardsPerDay,
    };
  }

  /** Answered cards per student between two instants — dashboard numbers. */
  async countAnswered(studentIds: string[], from: Date, to: Date): Promise<number> {
    if (studentIds.length === 0) return 0;
    return this.attempts
      .createQueryBuilder('a')
      .where('a.student_id IN (:...studentIds)', { studentIds })
      .andWhere('a.is_correct IS NOT NULL')
      .andWhere('a.created_at >= :from AND a.created_at < :to', { from, to })
      .getCount();
  }

  /** Due words in queue order; `limit` caps the preview. */
  async queue(studentId: string, now: Date, timeZone: string, limit = 50): Promise<QueueItem[]> {
    const due = await this.words.find({
      where: { studentId, status: WordStatus.LEARNING, nextDueAt: LessThanOrEqual(now) },
      order: { nextDueAt: 'ASC', createdAt: 'ASC' },
    });
    const todayStart = this.dayStart(now, timeZone);
    const items: QueueItem[] = due.map((word) => ({
      word,
      overdue: word.nextDueAt < todayStart,
      reason:
        word.nextDueAt < todayStart
          ? 'OVERDUE'
          : word.priority === WordPriority.HIGH
            ? 'PRIORITY'
            : 'DUE',
    }));
    const rank = { OVERDUE: 0, PRIORITY: 1, DUE: 2 };
    items.sort(
      (a, b) =>
        rank[a.reason] - rank[b.reason] ||
        a.word.nextDueAt.getTime() - b.word.nextDueAt.getTime() ||
        a.word.createdAt.getTime() - b.word.createdAt.getTime(),
    );
    return capStage3(items).slice(0, limit);
  }

  /** The card being shown right now (shown, not yet answered or skipped), if any. */
  async current(student: Student, now: Date, timeZone: string): Promise<CardView | null> {
    const open = await this.attempts.findOne({
      where: { studentId: student.id, answer: IsNull(), isCorrect: IsNull(), skipped: false },
      order: { createdAt: 'DESC' },
    });
    if (!open) return null;
    const word = await this.words.findOne({ where: { id: open.wordId } });
    if (!word || word.status !== WordStatus.LEARNING) {
      open.skipped = true;
      open.answeredAt = now;
      await this.attempts.save(open);
      return null;
    }
    return this.view(open, word, await this.today(student.id, now, timeZone));
  }

  /**
   * Show the next card: resumes an open one, otherwise takes the queue head
   * (skipping words already skipped today and respecting the stage-3 cap).
   */
  async next(student: Student, now: Date, timeZone: string): Promise<CardView | null> {
    const open = await this.current(student, now, timeZone);
    if (open) return open;

    const todayStart = this.dayStart(now, timeZone);
    const recent = await this.attempts.find({
      where: { studentId: student.id },
      order: { createdAt: 'DESC' },
      take: 50,
    });
    const todays = recent.filter((a) => a.createdAt >= todayStart);
    const skippedToday = new Set(todays.filter((a) => a.skipped).map((a) => a.wordId));
    const lastAnswered = todays
      .filter((a) => a.isCorrect !== null)
      .slice(0, globalConfig.cards.maxStage3InRow);
    const stage3Streak =
      lastAnswered.length >= globalConfig.cards.maxStage3InRow &&
      lastAnswered.every((a) => a.stage === CardStage.OWN_SENTENCE);

    const queue = (await this.queue(student.id, now, timeZone, 200)).filter(
      (q) => !skippedToday.has(q.word.id),
    );
    const pick =
      (stage3Streak ? queue.find((q) => q.word.stage !== CardStage.OWN_SENTENCE) : undefined) ??
      queue[0];
    if (!pick) return null;

    const word = pick.word;
    const lex = word.lemma
      ? ((await this.lexicon.findMany([word.lemma])).get(word.lemma) ?? null)
      : null;
    const shownBefore = recent.filter((a) => a.wordId === word.id && a.stage === word.stage).length;
    const prompt = this.buildPrompt(word, lex, shownBefore);
    const attempt = await this.attempts.save(
      this.attempts.create({
        studentId: student.id,
        wordId: word.id,
        stage: word.stage,
        prompt,
        answer: null,
        isCorrect: null,
        skipped: false,
        feedback: null,
        channel: CardChannel.MINI_APP,
      }),
    );
    return this.view(attempt, word, await this.today(student.id, now, timeZone));
  }

  private forms(word: Word, lex: WordLexicon | null): string[] {
    const set = new Set<string>(
      [word.word, lemmaOf(word.word), ...(lex?.forms ?? [])].map((f) => f.trim()).filter(Boolean),
    );
    return [...set];
  }

  private buildPrompt(word: Word, lex: WordLexicon | null, shownBefore: number): CardPrompt {
    const forms = this.forms(word, lex);
    const translation = word.translation ?? lex?.translation ?? null;
    if (word.stage === CardStage.GAP) {
      const gaps = lex?.gapSentences ?? [];
      const picked = gaps.length > 0 ? gaps[shownBefore % gaps.length] : null;
      const fromExample = picked ? null : maskWord(word.example ?? lex?.examples[0] ?? '', forms);
      const sentence = picked?.sentence ?? fromExample;
      if (sentence) {
        return {
          question: sentence,
          hint: picked?.hint ?? (translation ? `(${translation})` : undefined),
          acceptedAnswers: forms,
        };
      }
      // No material for a gap yet (enrichment pending) — ask for the word by its translation.
    }
    if (word.stage === CardStage.OWN_SENTENCE) {
      return { question: cardMessages.question[CardStage.OWN_SENTENCE], acceptedAnswers: forms };
    }
    return {
      question: translation
        ? cardMessages.question[CardStage.TRANSLATION]
        : 'Напиши это слово по-английски',
      hint:
        translation ?? (word.example ? (maskWord(word.example, forms) ?? undefined) : undefined),
      acceptedAnswers: forms,
    };
  }

  private view(attempt: CardAttempt, word: Word, today: TodayCards): CardView {
    const stage = attempt.stage;
    const gapLike = stage === CardStage.GAP && attempt.prompt.question.includes('___');
    return {
      attemptId: attempt.id,
      wordId: word.id,
      word: word.word,
      stage,
      stageLabel: cardMessages.stageLabel[stage],
      question: attempt.prompt.question,
      shown:
        stage === CardStage.OWN_SENTENCE
          ? word.word
          : gapLike
            ? null
            : (attempt.prompt.hint ?? null),
      hint: gapLike ? (attempt.prompt.hint ?? null) : null,
      placeholder: cardMessages.placeholder[stage],
      canGiveUp: stage !== CardStage.OWN_SENTENCE,
      today,
    };
  }

  private async openAttempt(
    student: Student,
    attemptId: string,
  ): Promise<{ attempt: CardAttempt; word: Word }> {
    const attempt = await this.attempts.findOne({
      where: { id: attemptId, studentId: student.id },
    });
    if (!attempt) {
      throw new AppError({
        level: ErrorLevel.LOW_BUSINESS,
        service: ServiceCode.CARDS,
        error: ErrorCode.NOT_FOUND,
        meta: { attemptId },
      });
    }
    if (attempt.isCorrect !== null || attempt.skipped) {
      throw new AppError({
        level: ErrorLevel.LOW_BUSINESS,
        service: ServiceCode.CARDS,
        error: ErrorCode.INVALID_STATE,
        message: 'card already answered',
        meta: { attemptId },
      });
    }
    const word = await this.words.findOne({ where: { id: attempt.wordId } });
    if (!word) {
      throw new AppError({
        level: ErrorLevel.LOW_BUSINESS,
        service: ServiceCode.CARDS,
        error: ErrorCode.NOT_FOUND,
        meta: { wordId: attempt.wordId },
      });
    }
    return { attempt, word };
  }

  /** `answer` null = "не помню" (counts as a mistake). */
  async answer(
    student: Student,
    attemptId: string,
    answer: string | null,
    now: Date,
    timeZone: string,
  ): Promise<AnswerResult> {
    const { attempt, word } = await this.openAttempt(student, attemptId);
    const accepted = (attempt.prompt.acceptedAnswers ?? [word.word]).map(normalizeAnswer);
    const given = answer === null ? '' : normalizeAnswer(answer);
    let correct = false;
    let feedback: string | null = null;

    if (answer !== null && given.length > 0) {
      if (attempt.stage === CardStage.OWN_SENTENCE) {
        const hasWord = accepted.some((f) =>
          new RegExp(`(^|\\s)${f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`).test(given),
        );
        const longEnough = given.split(' ').length >= 3;
        if (!hasWord) feedback = cardMessages.missingWord(word.word);
        else if (!longEnough) feedback = cardMessages.tooShort;
        else {
          const verdict = await this.sentences.check(student.id, word, answer);
          correct = verdict.ok;
          feedback = verdict.feedback;
        }
      } else {
        correct = accepted.includes(given);
      }
    }

    const { advanced, learned } = this.apply(word, correct, now);
    await this.words.save(word);
    attempt.answer = answer;
    attempt.isCorrect = correct;
    attempt.feedback = feedback;
    attempt.answeredAt = now;
    await this.attempts.save(attempt);

    return {
      attemptId: attempt.id,
      correct,
      expected: word.word,
      message: correct
        ? cardMessages.right(attempt.stage, word.word, learned)
        : cardMessages.wrong(attempt.stage, word.word, word.translation, word.example),
      feedback,
      advanced,
      learned,
      word: { id: word.id, stage: word.stage, status: word.status, nextDueAt: word.nextDueAt },
      today: await this.today(student.id, now, timeZone),
    };
  }

  /** Stage / interval / learned transitions — the customer's rules in one place. */
  apply(word: Word, correct: boolean, now: Date): { advanced: boolean; learned: boolean } {
    const cfg = globalConfig.cards;
    if (!correct) {
      word.nextDueAt = new Date(now.getTime() + cfg.intervalsDays[0] * DAY_MS);
      return { advanced: false, learned: false };
    }
    word.stageCorrect += 1;
    word.correctTotal += 1;
    let advanced = false;
    let learned = false;
    if (word.stage < CardStage.OWN_SENTENCE) {
      if (word.stageCorrect >= cfg.correctToAdvance) {
        word.stage = (word.stage + 1) as CardStage;
        word.stageCorrect = 0;
        advanced = true;
      }
    } else if (cfg.stage3ToLearned > 0 && word.stageCorrect >= cfg.stage3ToLearned) {
      word.status = WordStatus.LEARNED;
      word.learnedAt = now;
      learned = true;
    }
    const idx = Math.min(word.correctTotal - 1, cfg.intervalsDays.length - 1);
    word.nextDueAt = new Date(now.getTime() + cfg.intervalsDays[Math.max(idx, 0)] * DAY_MS);
    return { advanced, learned };
  }

  /** Put the card aside for today; the word and the norm are untouched. */
  async skip(
    student: Student,
    attemptId: string,
    now: Date,
    timeZone: string,
  ): Promise<TodayCards> {
    const { attempt } = await this.openAttempt(student, attemptId);
    attempt.skipped = true;
    attempt.answeredAt = now;
    await this.attempts.save(attempt);
    return this.today(student.id, now, timeZone);
  }

  /** Words of a student with their last attempts — for the student card in the dashboard. */
  async recentAttempts(studentId: string, limit = 20): Promise<CardAttempt[]> {
    return this.attempts.find({
      where: { studentId, isCorrect: In([true, false]) },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }
}

/** At most `maxStage3InRow` stage-3 cards consecutively; later ones wait for a non-stage-3 card. */
export function capStage3(items: QueueItem[]): QueueItem[] {
  const max = globalConfig.cards.maxStage3InRow;
  const out: QueueItem[] = [];
  const deferred: QueueItem[] = [];
  let streak = 0;
  for (const item of items) {
    if (item.word.stage === CardStage.OWN_SENTENCE) {
      if (streak >= max) {
        deferred.push(item);
        continue;
      }
      streak += 1;
    } else {
      streak = 0;
      out.push(item);
      if (deferred.length > 0 && streak === 0) {
        // after a non-stage-3 card one deferred stage-3 card may follow
        const d = deferred.shift() as QueueItem;
        out.push(d);
        streak = 1;
        continue;
      }
      continue;
    }
    out.push(item);
  }
  return [...out, ...deferred];
}
