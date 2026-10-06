/**
 * In-memory implementation of `Api` for demos and local UI work: the same
 * contract as the backend, the sample data of the design artboards, and the
 * same rules (one report per type per day, CLARIFY for a missing retelling,
 * dedupe on add, HIGH priority for manual and teacher words).
 */
import type { Api } from './client';
import {
  type AccessStatus,
  ApiError,
  type CardAnswer,
  type CardView,
  type TodayCards,
  type Cefr,
  type ImportPreview,
  type IntakeResult,
  type Profile,
  type Recommendation,
  type Report,
  type ReportType,
  type SpotCheck,
  type Week,
  type Word,
  type WordPriority,
  type WordSource,
  type WordStatus,
} from './types';

const DAY = 86_400_000;

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const dow = (x.getDay() + 6) % 7; // Monday = 0
  x.setDate(x.getDate() - dow);
  return x;
}
function isoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function sameDay(a: Date, b: Date): boolean {
  return isoDay(a) === isoDay(b);
}
function lemma(w: string): string {
  return w
    .toLowerCase()
    .replace(/^to\s+/, '')
    .replace(/[^\p{L}\p{N}\s'-]/gu, '')
    .trim();
}
let seq = 0;
function uid(): string {
  seq += 1;
  return `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`;
}
function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** A tiny "lexicon" so added words get a translation like the real enrichment does. */
const LEXICON: Record<string, { ru: string; cefr: Cefr; ex: string }> = {
  resilient: {
    ru: 'стойкий, жизнестойкий',
    cefr: 'C1',
    ex: 'Children are often more resilient than adults.',
  },
  stubborn: { ru: 'упрямый', cefr: 'B1', ex: 'He is too stubborn to admit he was wrong.' },
  'look forward to': {
    ru: 'ждать с нетерпением',
    cefr: 'B1',
    ex: 'I look forward to meeting you.',
  },
  cheat: { ru: 'мухлевать, жульничать', cefr: 'A2', ex: 'He was caught cheating in the exam.' },
  nap: { ru: 'короткий дневной сон', cefr: 'A2', ex: 'A short nap after lunch helps me focus.' },
  overwhelmed: {
    ru: 'ошеломлённый, перегруженный',
    cefr: 'B2',
    ex: 'She felt overwhelmed by the amount of work.',
  },
  reluctant: { ru: 'неохотный', cefr: 'B2', ex: 'He was reluctant to leave.' },
  thorough: { ru: 'тщательный', cefr: 'B2', ex: 'The police made a thorough search of the house.' },
  drowsy: { ru: 'сонный', cefr: 'B2', ex: 'The medicine made me feel drowsy.' },
  wand: { ru: 'волшебная палочка', cefr: 'B1', ex: 'Harry picked up the wand.' },
  muggle: { ru: 'магл, не волшебник', cefr: 'C1', ex: 'His parents were Muggles.' },
  enchanted: { ru: 'зачарованный', cefr: 'B2', ex: 'The enchanted forest was silent.' },
  postpone: { ru: 'откладывать', cefr: 'B1', ex: 'I need to postpone this task before Friday.' },
  diligent: { ru: 'прилежный, старательный', cefr: 'B2', ex: 'She is a diligent student.' },
  resourceful: { ru: 'находчивый', cefr: 'B2', ex: 'A resourceful traveller never gets lost.' },
  apparently: { ru: 'по-видимому', cefr: 'B1', ex: 'Apparently, the meeting was cancelled.' },
  itinerary: {
    ru: 'маршрут, план поездки',
    cefr: 'B2',
    ex: 'Our itinerary includes three cities.',
  },
  layover: { ru: 'пересадка, стыковка', cefr: 'B2', ex: 'We had a four-hour layover in Istanbul.' },
  'boarding pass': { ru: 'посадочный талон', cefr: 'A2', ex: 'Please show your boarding pass.' },
  customs: { ru: 'таможня', cefr: 'B1', ex: 'We went through customs quickly.' },
  accommodation: { ru: 'жильё, размещение', cefr: 'B1', ex: 'The price includes accommodation.' },
  sightseeing: {
    ru: 'осмотр достопримечательностей',
    cefr: 'A2',
    ex: 'We spent the day sightseeing.',
  },
  'jet lag': {
    ru: 'сбой биоритма после перелёта',
    cefr: 'B1',
    ex: 'I still have jet lag from the trip.',
  },
  commute: { ru: 'ездить на работу', cefr: 'B1', ex: 'I commute by bus every day.' },
  detour: { ru: 'объезд, крюк', cefr: 'B2', ex: 'We took a detour to avoid the traffic.' },
  souvenir: { ru: 'сувенир', cefr: 'A2', ex: 'I bought a souvenir for my sister.' },
  delayed: { ru: 'задержанный (рейс)', cefr: 'A2', ex: 'Our flight was delayed by two hours.' },
  backpacker: { ru: 'турист с рюкзаком', cefr: 'B1', ex: 'The hostel was full of backpackers.' },
  gloomy: { ru: 'мрачный, унылый', cefr: 'B2', ex: 'It was a gloomy, rainy morning.' },
  keen: { ru: 'увлечённый, страстно желающий', cefr: 'B1', ex: 'She is keen on photography.' },
  whisper: { ru: 'шептать', cefr: 'A2', ex: 'He whispered something in her ear.' },
};

interface MockOptions {
  /** Which first-login state to demo. */
  access?: AccessStatus;
  /** Request latency in ms (feels like a network). */
  latency?: number;
}

export class MockApi implements Api {
  private access: AccessStatus;
  private readonly latency: number;
  private readonly now = () => new Date();

  private profile: Profile;
  private wordsDb: Word[] = [];
  private reportsDb: Report[] = [];
  private draft: { id: string; type: ReportType; text: string; missing: string[] } | null = null;
  private pendingImport: { id: string; items: ImportPreview['items'] } | null = null;
  private spot: SpotCheck | null;
  private teacherList: Recommendation;
  private dismissed = false;
  private attempts: Array<{
    id: string;
    wordId: string;
    stage: 1 | 2 | 3;
    question: string;
    hint: string | null;
    isCorrect: boolean | null;
    skipped: boolean;
    createdAt: Date;
  }> = [];

  constructor(opts: MockOptions = {}) {
    this.access = opts.access ?? 'ACTIVE';
    this.latency = opts.latency ?? 250;
    const pending = this.access === 'PENDING_NAME';
    this.profile = {
      id: uid(),
      firstName: pending ? null : 'Акмаль',
      lastName: pending ? null : 'Хадиев',
      displayName: pending ? 'akmal_kh' : 'Акмаль Хадиев',
      username: 'akmal_kh',
      status: 'ACTIVE',
      level: 'UPPER_INTERMEDIATE',
      listeningMethod: 'PODCAST_NO_TRANSCRIPT',
      retellingRequired: true,
      groups: [{ chatId: '-1001', title: 'Upper 16:00', level: 'UPPER_INTERMEDIATE' }],
      calmMode: false,
      calmUntil: null,
      registeredAt: new Date(this.now().getTime() - 32 * DAY).toISOString(),
    };
    this.seed();
    this.spot = {
      id: uid(),
      question: 'Чем там закончилось — что ведущие посоветовали делать перед сном?',
      sourceTitle: '6 Minute English — Why do we sleep?',
    };
    this.teacherList = {
      list: { id: uid(), title: 'Unit 5 — Travel' },
      items: [
        'itinerary',
        'layover',
        'boarding pass',
        'customs',
        'accommodation',
        'sightseeing',
        'jet lag',
        'commute',
        'detour',
        'souvenir',
        'delayed',
        'backpacker',
      ].map((w) => ({ id: uid(), word: w, translation: LEXICON[w]?.ru ?? null })),
    };
  }

  /* ----- seed data from the design artboards ----- */

  private mkWord(word: string, o: Partial<Word> & { daysAgo?: number } = {}): Word {
    const lx = LEXICON[lemma(word)];
    const createdAt = new Date(this.now().getTime() - (o.daysAgo ?? 10) * DAY);
    return {
      id: uid(),
      word,
      translation: o.translation ?? lx?.ru ?? null,
      example: o.example ?? lx?.ex ?? null,
      cefr: o.cefr ?? lx?.cefr ?? null,
      status: o.status ?? 'LEARNING',
      stage: o.stage ?? 1,
      priority: o.priority ?? 'NORMAL',
      source: o.source ?? 'READING',
      sourceReportId: null,
      sourceListId: null,
      nextDueAt: o.status === 'LEARNED' ? null : new Date(createdAt.getTime() + DAY).toISOString(),
      createdAt: createdAt.toISOString(),
      learnedAt:
        o.status === 'LEARNED' ? new Date(createdAt.getTime() + 11 * DAY).toISOString() : null,
    };
  }

  private seed(): void {
    const n = this.now();
    const week = startOfWeek(n);
    const lastWeek = new Date(week.getTime() - 7 * DAY);
    const at = (base: Date, dayOffset: number, hour = 12) => {
      const d = new Date(base.getTime() + dayOffset * DAY);
      d.setHours(hour, 0, 0, 0);
      return d;
    };
    const mkReport = (r: Omit<Report, 'id' | 'weekStart'> & { createdAt: string }): Report => ({
      ...r,
      id: uid(),
      weekStart: isoDay(startOfWeek(new Date(r.createdAt))),
    });
    const todayOffset = (n.getDay() + 6) % 7;
    const reading = (date: Date, pages: number, words: string[], summary: string) =>
      mkReport({
        type: 'READING',
        method: null,
        sourceTitle: 'Harry Potter and the Philosopher’s Stone',
        episode: null,
        pages,
        summary,
        firstPassPct: null,
        secondPassPct: null,
        listenCount: null,
        unclearParts: null,
        wordsAdded: words,
        createdAt: date.toISOString(),
      });
    const listening = (
      date: Date,
      title: string,
      a: number,
      b: number,
      count: number,
      words: string[],
    ) =>
      mkReport({
        type: 'LISTENING',
        method: 'PODCAST_NO_TRANSCRIPT',
        sourceTitle: title,
        episode: null,
        pages: null,
        summary:
          'The episode was about why we sleep. The hosts said that a short nap helps memory.',
        firstPassPct: a,
        secondPassPct: b,
        listenCount: count,
        unclearParts: 'sleep debt',
        wordsAdded: words,
        createdAt: date.toISOString(),
      });

    this.reportsDb = [
      reading(
        at(week, Math.min(todayOffset, 1), 9),
        15,
        ['wand', 'muggle', 'enchanted'],
        'Гарри узнаёт, что он волшебник',
      ),
      listening(at(lastWeek, 6), '6 Minute English — Why do we sleep?', 70, 88, 3, [
        'drowsy',
        'nap',
      ]),
      reading(
        at(lastWeek, 5),
        12,
        ['gloomy', 'keen', 'whisper', 'apparently'],
        'Хагрид забирает Гарри',
      ),
      listening(at(lastWeek, 3), 'The Great Race', 60, 85, 2, ['stubborn', 'cheat', 'resourceful']),
      reading(at(lastWeek, 1), 10, ['postpone', 'diligent'], 'Письма из Хогвартса'),
      listening(at(lastWeek, 0), 'BBC Learning English — Plastic', 65, 90, 2, ['thorough']),
    ];
    // Today's reading is already handed in only if the first report falls on today.
    if (!sameDay(new Date(this.reportsDb[0].createdAt), n))
      this.reportsDb[0].createdAt = at(week, 0, 9).toISOString();

    const learned = [
      'wand',
      'enchanted',
      'cheat',
      'keen',
      'whisper',
      'gloomy',
      'thorough',
      'reluctant',
      'overwhelmed',
    ];
    const base: Array<[string, Partial<Word> & { daysAgo?: number }]> = [
      ['postpone', { source: 'MANUAL', priority: 'HIGH', stage: 2, daysAgo: 6 }],
      ['diligent', { stage: 3, daysAgo: 9 }],
      ['stubborn', { source: 'PODCAST', daysAgo: 5 }],
      ['resourceful', { source: 'PODCAST', priority: 'HIGH', stage: 2, daysAgo: 5 }],
      ['drowsy', { source: 'PODCAST', daysAgo: 2 }],
      ['nap', { source: 'PODCAST', daysAgo: 2 }],
      ['muggle', { daysAgo: 1 }],
      ['apparently', { daysAgo: 3 }],
      ['resilient', { source: 'TEACHER', priority: 'HIGH', daysAgo: 4 }],
    ];
    this.wordsDb = [
      ...base.map(([w, o]) => this.mkWord(w, o)),
      ...learned.map((w, i) => this.mkWord(w, { status: 'LEARNED', stage: 3, daysAgo: 14 + i })),
    ];
    // Fill up to 42 words like the design counter.
    const filler = [
      'accomplish',
      'ambiguous',
      'bargain',
      'brisk',
      'candid',
      'coherent',
      'cosy',
      'crave',
      'deceive',
      'devoted',
      'eager',
      'elaborate',
      'fierce',
      'flourish',
      'fragile',
      'genuine',
      'grasp',
      'hesitate',
      'insist',
      'jealous',
      'leisure',
      'mature',
      'neglect',
      'obvious',
    ];
    // Filler words are not due yet, so the cards queue starts with the real ones.
    filler.forEach((w, i) => {
      const fw = this.mkWord(w, { daysAgo: 12, translation: null, cefr: 'B2', example: null });
      fw.nextDueAt = new Date(this.now().getTime() + (1 + (i % 3)) * DAY).toISOString();
      this.wordsDb.push(fw);
    });
  }

  /* ----- helpers ----- */

  private async tick(): Promise<void> {
    if (this.latency) await delay(this.latency);
  }

  private weekOf(start: Date): Week {
    const end = new Date(start.getTime() + 7 * DAY);
    const inWeek = this.reportsDb.filter((r) => {
      const t = new Date(r.createdAt).getTime();
      return t >= start.getTime() && t < end.getTime();
    });
    return {
      weekStart: isoDay(start),
      reading: { done: inWeek.filter((r) => r.type === 'READING').length, norm: 3 },
      listening: { done: inWeek.filter((r) => r.type === 'LISTENING').length, norm: 3 },
    };
  }

  private enrich(
    word: string,
    translation: string | null,
    source: WordSource,
    priority: WordPriority,
  ): Word {
    const lx = LEXICON[lemma(word)];
    const w = this.mkWord(word, {
      translation: translation ?? lx?.ru ?? null,
      cefr: lx?.cefr ?? null,
      example: lx?.ex ?? null,
      source,
      priority,
      daysAgo: 0,
    });
    this.wordsDb.unshift(w);
    return w;
  }

  private owned(id: string): Word {
    const w = this.wordsDb.find((x) => x.id === id);
    if (!w) throw new ApiError('304002', 'Слово не найдено', 404);
    return w;
  }

  private saveReport(type: ReportType, text: string): IntakeResult {
    const n = this.now();
    const words = (text.match(/(?:слова|words)\s*:\s*([^\n]+)/i)?.[1] ?? '')
      .split(/[,;]/)
      .map((s) => s.split(/[—–-]/)[0].trim())
      .filter(Boolean);
    const addedWords: string[] = [];
    for (const w of words) {
      const dup = this.wordsDb.some((x) => lemma(x.word) === lemma(w));
      if (!dup) {
        this.enrich(w, null, type === 'READING' ? 'READING' : 'PODCAST', 'NORMAL');
        addedWords.push(w);
      }
    }
    const pages = Number(text.match(/(\d+)\s*(стр|page)/i)?.[1] ?? 0) || null;
    const pct = [...text.matchAll(/(\d{2})\s*%/g)].map((m) => Number(m[1]));
    const report: Report = {
      id: uid(),
      type,
      method: type === 'LISTENING' ? 'PODCAST_NO_TRANSCRIPT' : null,
      sourceTitle:
        type === 'READING'
          ? (text.match(/(?:Harry Potter[^,.\n]*|Гарри Поттер[^,.\n]*)/i)?.[0] ?? 'Книга из отчёта')
          : (text.match(/6 Minute English[^,.\n]*/i)?.[0] ?? 'Подкаст из отчёта'),
      episode: null,
      pages: type === 'READING' ? pages : null,
      summary: text.slice(0, 160),
      firstPassPct: type === 'LISTENING' ? (pct[0] ?? 70) : null,
      secondPassPct: type === 'LISTENING' ? (pct[1] ?? 88) : null,
      listenCount: type === 'LISTENING' ? Number(text.match(/(\d+)\s*раз/i)?.[1] ?? 3) : null,
      unclearParts: null,
      wordsAdded: addedWords,
      weekStart: isoDay(startOfWeek(n)),
      createdAt: n.toISOString(),
    };
    this.reportsDb.unshift(report);
    return {
      status: 'SAVED',
      report,
      weekProgress: this.weekOf(startOfWeek(n)),
      words: { added: addedWords.length, existing: words.length - addedWords.length },
    };
  }

  /* ----- Api ----- */

  auth: Api['auth'] = {
    webApp: async () => {
      await this.tick();
      const status = this.access;
      return {
        status,
        roles: status === 'ACTIVE' ? ['STUDENT'] : status === 'STAFF' ? ['TEACHER'] : [],
        token:
          status === 'ACTIVE' || status === 'PENDING_NAME' || status === 'STAFF'
            ? 'demo-token'
            : null,
        startParam: null,
      };
    },
  };

  me: Api['me'] = {
    get: async () => {
      await this.tick();
      return { ...this.profile };
    },
    register: async (firstName, lastName) => {
      await this.tick();
      const ok = (s: string) => /^[\p{L}][\p{L}'’-]{1,}$/u.test(s.trim());
      if (!ok(firstName) || !ok(lastName))
        throw new ApiError('203261', 'Похоже, это не имя и фамилия', 400);
      this.profile = {
        ...this.profile,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        displayName: `${firstName.trim()} ${lastName.trim()}`,
        registeredAt: this.now().toISOString(),
      };
      this.access = 'ACTIVE';
      return { ...this.profile };
    },
    rename: (f, l) => this.me.register(f, l),
    calmMode: async (on) => {
      await this.tick();
      this.profile = {
        ...this.profile,
        calmMode: on,
        calmUntil: on ? new Date(this.now().getTime() + 3 * DAY).toISOString() : null,
      };
      return { ...this.profile };
    },
    progress: async () => {
      await this.tick();
      const learning = this.wordsDb.filter((w) => w.status !== 'LEARNED');
      return {
        week: this.weekOf(startOfWeek(this.now())),
        cards: { ...this.cardsToday(), due: this.cardQueue().length, available: true },
        words: {
          total: this.wordsDb.length,
          learning: learning.length,
          learned: this.wordsDb.length - learning.length,
          priority: learning.filter((w) => w.priority === 'HIGH').length,
        },
      };
    },
    calendar: async (weeks) => {
      await this.tick();
      const start = startOfWeek(this.now());
      const out: Week[] = [];
      for (let i = 0; i < weeks; i++)
        out.push(this.weekOf(new Date(start.getTime() - i * 7 * DAY)));
      // Older weeks: a believable history like the design.
      const sample = [
        [3, 2],
        [2, 1],
        [3, 3],
        [0, 0],
      ];
      out.forEach((w, i) => {
        if (i >= 2 && i - 2 < sample.length) {
          w.reading.done = sample[i - 2][0];
          w.listening.done = sample[i - 2][1];
        }
      });
      return out;
    },
    recommendations: async () => {
      await this.tick();
      if (this.dismissed) return [];
      const owned = new Set(this.wordsDb.map((w) => lemma(w.word)));
      const items = this.teacherList.items.filter((i) => !owned.has(lemma(i.word)));
      return items.length ? [{ list: this.teacherList.list, items }] : [];
    },
    acceptRecommendations: async (ids) => {
      await this.tick();
      const owned = new Set(this.wordsDb.map((w) => lemma(w.word)));
      const pick = this.teacherList.items.filter((i) => ids === 'all' || ids.includes(i.id));
      const added: Word[] = [];
      let alreadyHad = 0;
      for (const i of pick) {
        if (owned.has(lemma(i.word))) alreadyHad += 1;
        else {
          const w = this.enrich(i.word, i.translation, 'TEACHER', 'HIGH');
          w.sourceListId = this.teacherList.list.id;
          added.push(w);
        }
      }
      return { added, alreadyHad };
    },
    dismissRecommendations: async (ids) => {
      await this.tick();
      this.dismissed = true;
      return { dismissed: ids === 'all' ? this.teacherList.items.length : ids.length };
    },
    spotCheck: async () => {
      await this.tick();
      return this.spot;
    },
    answerSpotCheck: async () => {
      await this.tick();
      this.spot = null;
    },
  };

  /* ----- cards: the customer's rules, same as CardsService on the backend ----- */

  private cardsToday(): TodayCards {
    const today = isoDay(this.now());
    const answered = this.attempts.filter(
      (a) => a.isCorrect !== null && isoDay(a.createdAt) === today,
    );
    return { done: answered.length, correct: answered.filter((a) => a.isCorrect).length, norm: 5 };
  }

  private cardQueue(): Word[] {
    const now = this.now();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const rank = (w: Word): number =>
      w.nextDueAt && new Date(w.nextDueAt) < todayStart ? 0 : w.priority === 'HIGH' ? 1 : 2;
    const due = this.wordsDb
      .filter((w) => w.status === 'LEARNING' && w.nextDueAt && new Date(w.nextDueAt) <= now)
      .sort((a, b) => rank(a) - rank(b) || String(a.nextDueAt).localeCompare(String(b.nextDueAt)));
    const out: Word[] = [];
    const deferred: Word[] = [];
    let streak = 0;
    for (const w of due) {
      if (w.stage === 3 && streak >= 2) {
        deferred.push(w);
        continue;
      }
      streak = w.stage === 3 ? streak + 1 : 0;
      out.push(w);
    }
    return [...out, ...deferred];
  }

  private cardView(a: (typeof this.attempts)[number], w: Word): CardView {
    return {
      attemptId: a.id,
      wordId: w.id,
      word: w.word,
      stage: a.stage,
      stageLabel: a.stage === 1 ? 'перевод' : a.stage === 2 ? 'в предложении' : 'своё предложение',
      question: a.question,
      shown: a.stage === 3 ? w.word : a.stage === 1 ? (w.translation ?? w.example ?? w.word) : null,
      hint: a.stage === 2 ? a.hint : null,
      placeholder:
        a.stage === 1
          ? 'Напиши по-английски'
          : a.stage === 2
            ? 'Впиши слово'
            : 'Напиши предложение',
      canGiveUp: a.stage !== 3,
      today: this.cardsToday(),
    };
  }

  private applyCard(w: Word, correct: boolean): { advanced: boolean; learned: boolean } {
    const n = this.now().getTime();
    if (!correct) {
      w.nextDueAt = new Date(n + DAY).toISOString();
      return { advanced: false, learned: false };
    }
    let advanced = false;
    let learned = false;
    if (w.stage < 3) {
      w.stage = (w.stage + 1) as 1 | 2 | 3;
      advanced = true;
    } else {
      w.status = 'LEARNED';
      w.learnedAt = new Date(n).toISOString();
      learned = true;
    }
    const intervals = [1, 3, 7];
    const total = this.attempts.filter((a) => a.wordId === w.id && a.isCorrect).length + 1;
    w.nextDueAt = new Date(n + intervals[Math.min(total - 1, 2)] * DAY).toISOString();
    return { advanced, learned };
  }

  cards: Api['cards'] = {
    state: async () => {
      await this.tick();
      const open = this.attempts.find((a) => a.isCorrect === null && !a.skipped);
      const w = open ? this.wordsDb.find((x) => x.id === open.wordId) : undefined;
      return {
        today: this.cardsToday(),
        queue: this.cardQueue()
          .slice(0, 10)
          .map((x) => ({
            id: x.id,
            word: x.word,
            translation: x.translation,
            stage: x.stage,
            priority: x.priority,
            source: x.source,
            overdue:
              !!x.nextDueAt && new Date(x.nextDueAt).getTime() < this.now().setHours(0, 0, 0, 0),
            reason: (x.nextDueAt &&
            new Date(x.nextDueAt).getTime() < this.now().setHours(0, 0, 0, 0)
              ? 'OVERDUE'
              : x.priority === 'HIGH'
                ? 'PRIORITY'
                : 'DUE') as 'OVERDUE' | 'PRIORITY' | 'DUE',
            nextDueAt: x.nextDueAt ?? this.now().toISOString(),
          })),
        current: open && w ? this.cardView(open, w) : null,
      };
    },
    next: async () => {
      await this.tick();
      const open = this.attempts.find((a) => a.isCorrect === null && !a.skipped);
      const openWord = open ? this.wordsDb.find((x) => x.id === open.wordId) : undefined;
      if (open && openWord)
        return { card: this.cardView(open, openWord), today: this.cardsToday() };
      const today = isoDay(this.now());
      const skipped = new Set(
        this.attempts
          .filter((a) => a.skipped && isoDay(a.createdAt) === today)
          .map((a) => a.wordId),
      );
      const w = this.cardQueue().find((x) => !skipped.has(x.id));
      if (!w) return { card: null, today: this.cardsToday() };
      const lx = LEXICON[lemma(w.word)];
      const gap = w.example ? w.example.replace(new RegExp(`\\b${w.word}\\w*`, 'i'), '___') : null;
      const a = {
        id: uid(),
        wordId: w.id,
        stage: w.stage,
        question:
          w.stage === 1
            ? w.translation
              ? 'Переведи на английский'
              : 'Напиши это слово по-английски'
            : w.stage === 2 && gap && gap !== w.example
              ? gap
              : w.stage === 2
                ? 'Напиши это слово по-английски'
                : 'Составь предложение со словом',
        hint: w.stage === 2 ? `(${w.translation ?? lx?.ru ?? '…'})` : null,
        isCorrect: null,
        skipped: false,
        createdAt: this.now(),
      };
      this.attempts.unshift(a);
      return { card: this.cardView(a, w), today: this.cardsToday() };
    },
    answer: async (attemptId, answer) => this.gradeCard(attemptId, answer),
    giveUp: async (attemptId) => this.gradeCard(attemptId, null),
    skip: async (attemptId) => {
      await this.tick();
      const a = this.attempts.find((x) => x.id === attemptId);
      if (a) a.skipped = true;
      return { today: this.cardsToday() };
    },
  };

  private async gradeCard(attemptId: string, answer: string | null): Promise<CardAnswer> {
    await delay(this.latency + (answer && answer.split(' ').length > 2 ? 900 : 0));
    const a = this.attempts.find((x) => x.id === attemptId);
    const w = a ? this.wordsDb.find((x) => x.id === a.wordId) : undefined;
    if (!a || !w) throw new ApiError('306002', 'Карточка не найдена', 404);
    if (a.isCorrect !== null || a.skipped)
      throw new ApiError('306251', 'Карточка уже отвечена', 409);
    const norm = (s: string) =>
      s
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^to /, '');
    const given = answer ? norm(answer) : '';
    let correct = false;
    let feedback: string | null = null;
    if (given) {
      if (a.stage === 3) {
        const hasWord = given.includes(norm(w.word).split(' ')[0]);
        if (!hasWord) feedback = `В предложении должно быть само слово — ${w.word}.`;
        else if (given.split(' ').length < 3)
          feedback = 'Нужно целое предложение — хотя бы три слова с этим словом внутри.';
        else {
          correct = true;
          if (/(^|\s)i\s/.test(answer ?? ''))
            feedback = 'Местоимение I в английском всегда с большой буквы.';
        }
      } else correct = given === norm(w.word);
    }
    const { advanced, learned } = this.applyCard(w, correct);
    a.isCorrect = correct;
    const message = correct
      ? learned
        ? `Отлично, слово употреблено по смыслу — ${w.word} уходит в выученные.`
        : a.stage === 1
          ? `Точно, ${w.word}. Слово переходит на стадию 2 — в следующий раз встретимся с ним в предложении.`
          : `Да, ${w.word}. Слово сидит — в следующий раз попросим составить с ним своё предложение.`
      : a.stage === 3
        ? `Похоже, слово употреблено не совсем по смыслу. ${w.word} — «${w.translation ?? '…'}». Попробуем в другой раз.`
        : `Правильный ответ: ${w.word}. Ничего страшного, вернёмся к нему завтра.`;
    return {
      attemptId,
      correct,
      expected: w.word,
      message,
      feedback,
      advanced,
      learned,
      word: {
        id: w.id,
        stage: w.stage,
        status: w.status,
        nextDueAt: w.nextDueAt ?? this.now().toISOString(),
      },
      today: this.cardsToday(),
    };
  }

  words: Api['words'] = {
    list: async (q) => {
      await this.tick();
      const needle = q.q?.trim().toLowerCase();
      return this.wordsDb
        .filter((w) => !q.status || w.status === q.status)
        .filter((w) => !q.priority || (w.priority === q.priority && w.status !== 'LEARNED'))
        .filter((w) => !q.cefr || w.cefr === q.cefr)
        .filter((w) => !q.source || w.source === q.source)
        .filter(
          (w) =>
            !needle ||
            w.word.toLowerCase().includes(needle) ||
            (w.translation ?? '').toLowerCase().includes(needle),
        )
        .slice(0, q.limit ?? 100)
        .map((w) => ({ ...w }));
    },
    summary: async () => {
      await this.tick();
      const s = {
        total: this.wordsDb.length,
        learning: 0,
        learned: 0,
        priority: 0,
        byCefr: {} as Record<string, number>,
        bySource: {} as Record<string, number>,
      };
      for (const w of this.wordsDb) {
        if (w.status === 'LEARNED') s.learned += 1;
        else s.learning += 1;
        if (w.priority === 'HIGH' && w.status !== 'LEARNED') s.priority += 1;
        s.byCefr[w.cefr ?? 'unknown'] = (s.byCefr[w.cefr ?? 'unknown'] ?? 0) + 1;
        s.bySource[w.source] = (s.bySource[w.source] ?? 0) + 1;
      }
      return s;
    },
    one: async (id) => {
      await this.tick();
      return { ...this.owned(id) };
    },
    add: async (input) => {
      await this.tick();
      const owned = new Map(this.wordsDb.map((w) => [lemma(w.word), w]));
      const added: Word[] = [];
      const alreadyHad: Word[] = [];
      const alreadyLearned: Word[] = [];
      for (const i of input) {
        const ex = owned.get(lemma(i.word));
        if (ex) (ex.status === 'LEARNED' ? alreadyLearned : alreadyHad).push(ex);
        else added.push(this.enrich(i.word, i.translation ?? null, 'MANUAL', 'HIGH'));
      }
      return { preview: false, added, alreadyHad, alreadyLearned };
    },
    importText: async (text) => {
      await this.tick();
      const owned = new Set(this.wordsDb.map((w) => lemma(w.word)));
      const seen = new Set<string>();
      const items: ImportPreview['items'] = [];
      for (const raw of text.split(/[\n,;]+/)) {
        const line = raw.replace(/^\s*\d+[.)]\s*/, '').trim();
        if (!line) continue;
        const [w, ...rest] = line.split(/\s+[—–-]\s+|\s*[:=]\s*/);
        const word = w.trim();
        if (!word || seen.has(lemma(word))) continue;
        seen.add(lemma(word));
        items.push({
          word,
          translation: rest.join(' ').trim() || LEXICON[lemma(word)]?.ru || null,
          duplicate: owned.has(lemma(word)),
        });
      }
      const dups = items.filter((i) => i.duplicate).length;
      this.pendingImport = { id: uid(), items };
      return {
        importId: this.pendingImport.id,
        found: items.length,
        duplicates: dups,
        toAdd: items.length - dups,
        items,
      };
    },
    confirmImport: async (id, exclude) => {
      await this.tick();
      if (!this.pendingImport || this.pendingImport.id !== id)
        throw new ApiError('304258', 'Список устарел — разбери его заново', 409);
      const skip = new Set(exclude.map(lemma));
      const words = this.pendingImport.items
        .filter((i) => !i.duplicate && !skip.has(lemma(i.word)))
        .map((i) => this.enrich(i.word, i.translation, 'IMPORT', 'HIGH'));
      this.pendingImport = null;
      return { added: words.length, words };
    },
    cancelImport: async () => {
      await this.tick();
      this.pendingImport = null;
    },
    patch: async (id, patch) => {
      await this.tick();
      const w = this.owned(id);
      if (patch.translation !== undefined) w.translation = patch.translation;
      if (patch.status !== undefined) {
        w.status = patch.status as WordStatus;
        w.learnedAt = patch.status === 'LEARNED' ? this.now().toISOString() : null;
        w.nextDueAt =
          patch.status === 'LEARNED' ? null : new Date(this.now().getTime() + DAY).toISOString();
      }
      return { ...w };
    },
    priority: async (id, priority) => {
      await this.tick();
      const w = this.owned(id);
      w.priority = priority;
      return { ...w };
    },
    exportText: async (format) => {
      await this.tick();
      const rows = this.wordsDb.map((w) =>
        format === 'csv'
          ? `"${w.word}","${w.translation ?? ''}","${w.status}"`
          : `${w.word} — ${w.translation ?? ''}`,
      );
      const head = format === 'csv' ? 'word,translation,status\n' : '';
      return {
        filename: `thinkread-words-${isoDay(this.now())}.${format}`,
        content: head + rows.join('\n'),
      };
    },
  };

  reports: Api['reports'] = {
    list: async (limit, cursor) => {
      await this.tick();
      const before = cursor ? new Date(cursor).getTime() : Infinity;
      const rows = this.reportsDb
        .filter((r) => new Date(r.createdAt).getTime() < before)
        .slice(0, limit);
      return {
        data: rows.map((r) => ({ ...r })),
        meta: { nextCursor: rows.length === limit ? rows[rows.length - 1].createdAt : null },
      };
    },
    today: async () => {
      await this.tick();
      const n = this.now();
      const has = (t: ReportType) =>
        this.reportsDb.some((r) => r.type === t && sameDay(new Date(r.createdAt), n));
      return { READING: has('READING'), LISTENING: has('LISTENING') };
    },
    submit: async (type, text) => {
      await delay(this.latency + 900);
      const n = this.now();
      if (this.reportsDb.some((r) => r.type === type && sameDay(new Date(r.createdAt), n)))
        throw new ApiError(
          '305260',
          'Сегодня отчёт этого типа уже сдан — следующий можно сдать завтра',
          409,
        );
      if (type === 'LISTENING') {
        const english = (text.match(/[A-Za-z]{3,}/g) ?? []).length;
        if (english < 15) {
          this.draft = { id: uid(), type, text, missing: ['retelling'] };
          return {
            status: 'CLARIFY',
            draftId: this.draft.id,
            missingFields: ['retelling'],
            question:
              'Спасибо! Для твоего уровня нужен ещё короткий пересказ: 2–3 предложения по-английски, о чём был выпуск.',
          };
        }
      }
      return this.saveReport(type, text);
    },
    clarify: async (draftId, text) => {
      await delay(this.latency + 900);
      if (!this.draft || this.draft.id !== draftId)
        throw new ApiError('305002', 'Черновик не найден — начни отчёт заново', 404);
      const d = this.draft;
      this.draft = null;
      return this.saveReport(d.type, `${d.text}\n${text}`);
    },
    patch: async (id, patch) => {
      await this.tick();
      const r = this.reportsDb.find((x) => x.id === id);
      if (!r) throw new ApiError('305002', 'Отчёт не найден', 404);
      Object.assign(r, patch);
      return { ...r };
    },
  };
}
