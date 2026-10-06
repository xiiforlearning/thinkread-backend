import { globalConfig } from '../../config/global.config';
import { Word } from '../words/word.entity';
import { CardStage, WordPriority, WordSource, WordStatus } from '../words/word.enums';
import { CardsService, capStage3, maskWord, normalizeAnswer, QueueItem } from './cards.service';

const DAY = 86_400_000;
const now = new Date('2026-10-06T10:00:00Z'); // 15:00 in Tashkent
const TZ = 'Asia/Tashkent';

function word(o: Partial<Word>): Word {
  return {
    id: o.id ?? Math.random().toString(36).slice(2),
    studentId: 's1',
    word: 'postpone',
    lemma: 'postpone',
    translation: 'откладывать',
    example: 'I need to postpone this task.',
    cefr: null,
    status: WordStatus.LEARNING,
    priority: WordPriority.NORMAL,
    stage: CardStage.TRANSLATION,
    stageCorrect: 0,
    correctTotal: 0,
    nextDueAt: new Date(now.getTime() - DAY),
    source: WordSource.READING,
    sourceReportId: null,
    sourceListId: null,
    createdAt: new Date(now.getTime() - 5 * DAY),
    learnedAt: null,
    updatedAt: now,
    ...o,
  } as Word;
}

function item(w: Word): QueueItem {
  return { word: w, overdue: false, reason: 'DUE' };
}

function make(
  words: Word[],
  attempts: Array<Record<string, unknown>> = [],
): {
  svc: CardsService;
  attemptsRepo: { save: jest.Mock; find: jest.Mock; findOne: jest.Mock };
  sentences: { check: jest.Mock };
} {
  let seq = 0;
  const attemptsRepo = {
    create: jest.fn((x: Record<string, unknown>) => x),
    save: jest.fn(async (x: Record<string, unknown>) => {
      if (!x.id) {
        seq += 1;
        x.id = `a${seq}`;
        x.createdAt = now;
        attempts.push(x);
      }
      return x;
    }),
    find: jest.fn(async () => [...attempts].reverse()),
    findOne: jest.fn(
      async (q: { where: Record<string, unknown> }) =>
        attempts.find(
          (a) =>
            a.id === q.where.id ||
            (q.where.answer !== undefined && a.isCorrect === null && !a.skipped),
        ) ?? null,
    ),
    createQueryBuilder: jest.fn(() => {
      const qb: Record<string, unknown> = {};
      for (const m of ['select', 'addSelect', 'where', 'andWhere']) qb[m] = () => qb;
      qb.getRawOne = async () => ({
        done: String(attempts.filter((a) => a.isCorrect !== null).length),
        correct: String(attempts.filter((a) => a.isCorrect === true).length),
      });
      qb.getCount = async () => attempts.filter((a) => a.isCorrect !== null).length;
      return qb;
    }),
  };
  const wordsRepo = {
    find: jest.fn(async () =>
      words.filter((w) => w.status === WordStatus.LEARNING && w.nextDueAt <= now),
    ),
    findOne: jest.fn(
      async (q: { where: { id: string } }) => words.find((w) => w.id === q.where.id) ?? null,
    ),
    save: jest.fn(async (w: Word) => w),
  };
  const lexicon = { findMany: jest.fn(async () => new Map()) };
  const sentences = { check: jest.fn(async () => ({ ok: true, feedback: null })) };
  return {
    svc: new CardsService(
      attemptsRepo as never,
      wordsRepo as never,
      lexicon as never,
      sentences as never,
    ),
    attemptsRepo,
    sentences,
  };
}

const student = { id: 's1' } as never;

describe('normalizeAnswer / maskWord', () => {
  it('ignores case, punctuation and a leading "to"', () => {
    expect(normalizeAnswer('  To Postpone! ')).toBe('postpone');
    expect(normalizeAnswer("Don't give up.")).toBe("don't give up");
  });
  it('masks the longest matching form', () => {
    expect(maskWord('He postponed the meeting', ['postpone', 'postponed'])).toBe(
      'He ___ the meeting',
    );
    expect(maskWord('Nothing here', ['postpone'])).toBeNull();
  });
});

describe('capStage3', () => {
  it('never shows more than two stage-3 cards in a row', () => {
    const s3 = (id: string): QueueItem => item(word({ id, stage: CardStage.OWN_SENTENCE }));
    const s1 = (id: string): QueueItem => item(word({ id, stage: CardStage.TRANSLATION }));
    const order = capStage3([s3('a'), s3('b'), s3('c'), s1('d'), s3('e')]).map((q) => q.word.id);
    expect(order).toEqual(['a', 'b', 'd', 'c', 'e']);
  });
});

describe('CardsService', () => {
  const original = { ...globalConfig.cards };
  afterEach(() => Object.assign(globalConfig.cards, original));

  it('orders the queue: overdue → priority → due', async () => {
    const overdue = word({ id: 'o', nextDueAt: new Date(now.getTime() - 2 * DAY) });
    const prio = word({
      id: 'p',
      priority: WordPriority.HIGH,
      nextDueAt: new Date(now.getTime() - 3600_000),
    });
    const due = word({ id: 'd', nextDueAt: new Date(now.getTime() - 7200_000) });
    const { svc } = make([due, prio, overdue]);
    const q = await svc.queue('s1', now, TZ);
    expect(q.map((x) => x.word.id)).toEqual(['o', 'p', 'd']);
    expect(q[0].reason).toBe('OVERDUE');
    expect(q[1].reason).toBe('PRIORITY');
  });

  it('one correct answer moves the word a stage and schedules 1 / 3 / 7 days', async () => {
    const w = word({ id: 'w' });
    const { svc } = make([w]);
    const card = await svc.next(student, now, TZ);
    expect(card?.stage).toBe(CardStage.TRANSLATION);
    expect(card?.shown).toBe('откладывать');

    const r1 = await svc.answer(student, card?.attemptId as string, 'To postpone', now, TZ);
    expect(r1.correct).toBe(true);
    expect(r1.advanced).toBe(true);
    expect(w.stage).toBe(CardStage.GAP);
    expect(w.nextDueAt.getTime() - now.getTime()).toBe(1 * DAY);
    expect(r1.today).toEqual({ done: 1, correct: 1, norm: globalConfig.norms.cardsPerDay });

    w.nextDueAt = now;
    svc.apply(w, true, now);
    expect(w.stage).toBe(CardStage.OWN_SENTENCE);
    expect(w.nextDueAt.getTime() - now.getTime()).toBe(3 * DAY);
    svc.apply(w, true, now);
    expect(w.status).toBe(WordStatus.LEARNED);
    expect(w.nextDueAt.getTime() - now.getTime()).toBe(7 * DAY);
  });

  it('a mistake or "не помню" means tomorrow and keeps stage and intervals', async () => {
    const w = word({ id: 'w', stage: CardStage.GAP, correctTotal: 2 });
    const { svc } = make([w]);
    const card = await svc.next(student, now, TZ);
    const r = await svc.answer(student, card?.attemptId as string, null, now, TZ);
    expect(r.correct).toBe(false);
    expect(r.message).toContain('Правильный ответ: postpone');
    expect(w.stage).toBe(CardStage.GAP);
    expect(w.correctTotal).toBe(2);
    expect(w.nextDueAt.getTime() - now.getTime()).toBe(1 * DAY);
  });

  it('stage 3 needs the word inside a real sentence, then asks the AI', async () => {
    const w = word({ id: 'w', stage: CardStage.OWN_SENTENCE });
    const { svc, sentences } = make([w]);
    const card = await svc.next(student, now, TZ);
    expect(card?.canGiveUp).toBe(false);
    const short = await svc.answer(student, card?.attemptId as string, 'postpone it', now, TZ);
    expect(short.correct).toBe(false);
    expect(short.feedback).toBe(
      'Нужно целое предложение — хотя бы три слова с этим словом внутри.',
    );
    expect(sentences.check).not.toHaveBeenCalled();

    w.nextDueAt = now; // the next day
    const again = await svc.next(student, now, TZ);
    const ok = await svc.answer(
      student,
      again?.attemptId as string,
      'I had to postpone my trip.',
      now,
      TZ,
    );
    expect(sentences.check).toHaveBeenCalledTimes(1);
    expect(ok.correct).toBe(true);
    expect(ok.learned).toBe(true);
  });

  it('skip puts the card aside without touching the word or the norm', async () => {
    const w = word({ id: 'w' });
    const { svc } = make([w]);
    const card = await svc.next(student, now, TZ);
    const today = await svc.skip(student, card?.attemptId as string, now, TZ);
    expect(today.done).toBe(0);
    expect(w.stage).toBe(CardStage.TRANSLATION);
    expect(await svc.next(student, now, TZ)).toBeNull();
  });
});
