/**
 * In-memory `AdminApi` for the demo: the school of the design artboards (6 groups,
 * 9 students, 7 flags, 3 teacher lists) with the same rules as the backend —
 * health from silence, one norm per type, quiet flags, owner-only actions.
 */
import { ApiError, type GroupLevel, type Report, type Week, type Word } from '../api/types';
import type {
  AdminApi,
  AdminReport,
  AiUsage,
  ChatReply,
  FlagDetail,
  FlagKind,
  FlagStatus,
  FlagView,
  GroupView,
  Health,
  MembershipCheck,
  Overview,
  ReminderRun,
  SettingView,
  StaffMember,
  StudentCard,
  StudentDetail,
  StudentRow,
  WeeklySummary,
  WordListView,
} from './api';

const DAY = 86_400_000;
let seq = 0;
function uid(): string {
  seq += 1;
  return `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`;
}
function delay(ms = 250): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
function isoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function monday(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}
function weeksBack(n: number, now = new Date()): string[] {
  const m = monday(now);
  return Array.from({ length: n }, (_, i) => isoDay(new Date(m.getTime() - i * 7 * DAY)));
}
function daysAgo(n: number, hour = 19): Date {
  const d = new Date(Date.now() - n * DAY);
  d.setHours(hour, 15, 0, 0);
  return d;
}

interface G {
  chatId: number;
  title: string;
  level: GroupLevel;
  members: number;
  teachers: number[];
  good: number;
  warn: number;
  bad: number;
}
const GROUPS: G[] = [
  {
    chatId: -1001,
    title: 'Pre 14:00',
    level: 'PRE_INTERMEDIATE',
    members: 17,
    teachers: [1],
    good: 9,
    warn: 5,
    bad: 3,
  },
  {
    chatId: -1002,
    title: 'Inter 18:00',
    level: 'INTERMEDIATE',
    members: 18,
    teachers: [1],
    good: 11,
    warn: 4,
    bad: 3,
  },
  {
    chatId: -1003,
    title: 'Upper 16:00',
    level: 'UPPER_INTERMEDIATE',
    members: 17,
    teachers: [1, 777],
    good: 13,
    warn: 3,
    bad: 1,
  },
  {
    chatId: -1004,
    title: 'Adv 18:00',
    level: 'ADVANCED',
    members: 15,
    teachers: [1],
    good: 12,
    warn: 2,
    bad: 1,
  },
  {
    chatId: -1005,
    title: 'IELTS I',
    level: 'IELTS',
    members: 15,
    teachers: [777],
    good: 10,
    warn: 4,
    bad: 1,
  },
  {
    chatId: -1006,
    title: 'IELTS II',
    level: 'IELTS',
    members: 14,
    teachers: [1],
    good: 9,
    warn: 3,
    bad: 2,
  },
];

const STAFF: StaffMember[] = [
  {
    telegramUserId: 1,
    name: 'Рустам',
    role: 'OWNER',
    granted: true,
    groups: GROUPS.filter((g) => g.teachers.includes(1)).map((g) => ({
      chatId: g.chatId,
      title: g.title,
    })),
  },
  {
    telegramUserId: 777,
    name: 'Дилшод Усманов',
    role: 'TEACHER',
    granted: true,
    groups: GROUPS.filter((g) => g.teachers.includes(777)).map((g) => ({
      chatId: g.chatId,
      title: g.title,
    })),
  },
];

interface S {
  id: string;
  name: string;
  username: string;
  group: G;
  silent: number;
  r: number;
  l: number;
  words: number;
  learned: number;
  blocked?: boolean;
  /** Weekly [reading, listening] for the 6 recent weeks, newest first (index 0 = this week). */
  history: Array<[number, number]>;
}
const g = (title: string): G => GROUPS.find((x) => x.title === title) as G;
const STUDENTS: S[] = [
  {
    id: '11111111-1111-4111-8111-111111111101',
    name: 'Фирдавс Каримов',
    username: 'firdavs_k',
    group: g('Inter 18:00'),
    silent: 15,
    r: 0,
    l: 0,
    words: 31,
    learned: 4,
    history: [
      [0, 0],
      [0, 0],
      [0, 0],
      [1, 1],
      [3, 2],
      [3, 3],
    ],
  },
  {
    id: '11111111-1111-4111-8111-111111111102',
    name: 'Бобур Алиев',
    username: 'bobur',
    group: g('IELTS II'),
    silent: 12,
    r: 0,
    l: 0,
    words: 58,
    learned: 12,
    blocked: true,
    history: [
      [0, 0],
      [0, 0],
      [1, 0],
      [2, 1],
      [3, 3],
      [3, 2],
    ],
  },
  {
    id: '11111111-1111-4111-8111-111111111103',
    name: 'Севара Мирзаева',
    username: 'sevara_m',
    group: g('Pre 14:00'),
    silent: 9,
    r: 1,
    l: 0,
    words: 22,
    learned: 3,
    history: [
      [1, 0],
      [0, 0],
      [1, 1],
      [2, 1],
      [3, 2],
      [2, 3],
    ],
  },
  {
    id: '11111111-1111-4111-8111-111111111104',
    name: 'Нилуфар Тошева',
    username: 'nilufar',
    group: g('Upper 16:00'),
    silent: 3,
    r: 2,
    l: 1,
    words: 47,
    learned: 15,
    history: [
      [2, 1],
      [2, 1],
      [3, 3],
      [3, 2],
      [3, 3],
      [2, 3],
    ],
  },
  {
    id: '11111111-1111-4111-8111-111111111105',
    name: 'Жасур Назаров',
    username: 'jasur_n',
    group: g('Adv 18:00'),
    silent: 4,
    r: 1,
    l: 1,
    words: 90,
    learned: 40,
    history: [
      [1, 1],
      [2, 2],
      [3, 3],
      [3, 2],
      [3, 3],
      [3, 3],
    ],
  },
  {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Акмаль Хадиев',
    username: 'akmal_kh',
    group: g('Upper 16:00'),
    silent: 0,
    r: 1,
    l: 0,
    words: 42,
    learned: 9,
    history: [
      [1, 0],
      [3, 3],
      [3, 2],
      [2, 1],
      [3, 3],
      [3, 3],
    ],
  },
  {
    id: '11111111-1111-4111-8111-111111111107',
    name: 'Малика Юсупова',
    username: 'malika_y',
    group: g('Adv 18:00'),
    silent: 0,
    r: 3,
    l: 2,
    words: 120,
    learned: 64,
    history: [
      [3, 2],
      [3, 3],
      [3, 3],
      [3, 3],
      [3, 3],
      [3, 3],
    ],
  },
  {
    id: '11111111-1111-4111-8111-111111111108',
    name: 'Тимур Рахимов',
    username: 'timur_r',
    group: g('Upper 16:00'),
    silent: 1,
    r: 2,
    l: 2,
    words: 76,
    learned: 30,
    history: [
      [2, 2],
      [3, 3],
      [3, 2],
      [3, 3],
      [2, 3],
      [3, 3],
    ],
  },
  {
    id: '11111111-1111-4111-8111-111111111109',
    name: 'Дильноза Ахмедова',
    username: 'dilnoza',
    group: g('IELTS I'),
    silent: 1,
    r: 2,
    l: 1,
    words: 64,
    learned: 22,
    history: [
      [2, 1],
      [3, 3],
      [3, 2],
      [2, 1],
      [3, 3],
      [3, 3],
    ],
  },
];

function healthOf(s: S, thresholds: { warn: number; bad: number }, archived: boolean): Health {
  if (archived) return 'bad';
  if (s.blocked) return 'bad';
  if (s.silent >= thresholds.bad) return 'bad';
  if (s.silent >= thresholds.warn) return 'warn';
  return 'good';
}

function reading(d: Date, book: string, pages: number, text: string, words: string[]): AdminReport {
  return {
    id: uid(),
    type: 'READING',
    method: null,
    sourceTitle: book,
    episode: null,
    pages,
    summary: text,
    firstPassPct: null,
    secondPassPct: null,
    listenCount: null,
    unclearParts: null,
    wordsAdded: words,
    weekStart: isoDay(monday(d)),
    createdAt: d.toISOString(),
    rawText: `прочитал ${pages} страниц ${book}, ${text.toLowerCase()}, слова: ${words.join(', ')}`,
    isForwarded: false,
  };
}
function listening(
  d: Date,
  title: string,
  first: number,
  second: number | null,
  times: number,
  retelling: string,
  words: string[],
  raw?: string,
  forwarded = false,
): AdminReport {
  return {
    id: uid(),
    type: 'LISTENING',
    method: 'PODCAST_NO_TRANSCRIPT',
    sourceTitle: title,
    episode: null,
    pages: null,
    summary: retelling,
    firstPassPct: first,
    secondPassPct: second,
    listenCount: times,
    unclearParts: null,
    wordsAdded: words,
    weekStart: isoDay(monday(d)),
    createdAt: d.toISOString(),
    rawText:
      raw ??
      `слушал ${title}, с первого раза ${first}%${second ? `, после ${times}-го ${second}%` : ''}, слушал ${times} раз. ${retelling} слова: ${words.join(', ')}`,
    isForwarded: forwarded,
  };
}

function stripRaw(r: AdminReport): Report {
  const view: Report & { rawText?: string; isForwarded?: boolean } = { ...r };
  delete view.rawText;
  delete view.isForwarded;
  return view;
}
const byName = (name: string): S => STUDENTS.find((s) => s.name === name) as S;
const REPORTS: Record<string, AdminReport[]> = {};
function add(s: S, ...r: AdminReport[]): void {
  REPORTS[s.id] = [...(REPORTS[s.id] ?? []), ...r];
}
{
  const akmal = byName('Акмаль Хадиев');
  add(
    akmal,
    reading(
      daysAgo(0, 9),
      'Harry Potter and the Philosopher’s Stone',
      15,
      'Про то, как Гарри узнал, что он волшебник',
      ['wand', 'muggle', 'enchanted'],
    ),
    listening(
      daysAgo(2),
      '6 Minute English',
      70,
      88,
      3,
      'The episode was about why we sleep. The hosts said that a short nap helps memory, but long naps make you drowsy.',
      ['drowsy', 'nap'],
    ),
    reading(daysAgo(3), 'Harry Potter and the Philosopher’s Stone', 12, 'Хагрид забирает Гарри', [
      'hut',
      'giant',
      'umbrella',
      'roar',
    ]),
    listening(
      daysAgo(8),
      'Luke’s English Podcast',
      60,
      80,
      2,
      'Luke talked about his trip to Japan, food and trains.',
      ['bullet train', 'etiquette'],
    ),
    reading(daysAgo(10), 'Harry Potter and the Philosopher’s Stone', 14, 'Письма из Хогвартса', [
      'owl',
      'envelope',
    ]),
  );
  const nilufar = byName('Нилуфар Тошева');
  add(
    nilufar,
    listening(
      daysAgo(3),
      'TED Talks Daily',
      100,
      null,
      1,
      'The speaker talked about how small habits change your life. He said that you should start with two minutes a day.',
      ['tiny', 'cue', 'craving'],
      'слушала TED Talks Daily про привычки, с первого раза 100%, слушала 1 раз.\nThe speaker talked about how small habits change your life. He said that you should start with two minutes a day.\nслова: tiny, cue, craving',
    ),
    listening(
      daysAgo(6),
      '6 Minute English',
      65,
      85,
      3,
      'The hosts talked about coffee and how much is safe to drink every day.',
      ['caffeine'],
      'слушала про кофе, с первого раза 65%, после третьего 85. The hosts talked about coffee and how much is safe to drink every day… слова: caffeine',
    ),
    listening(
      daysAgo(10),
      'Luke’s English Podcast',
      60,
      80,
      2,
      'Luke talked about his trip to Japan, food and trains, some words I didn’t know.',
      ['commute'],
      'с первого раза 60%. Luke talked about his trip to Japan, food and trains, some words I didn’t know… слова: commute',
    ),
    reading(daysAgo(4), 'The Alchemist', 11, 'Сантьяго встречает Мелхиседека', [
      'omen',
      'shepherd',
    ]),
    reading(daysAgo(7), 'The Alchemist', 10, 'Начало пути', ['crystal', 'merchant']),
  );
  const firdavs = byName('Фирдавс Каримов');
  add(
    firdavs,
    reading(daysAgo(22), 'The Alchemist', 8, 'Сантьяго продал овец', ['shepherd', 'omen']),
    listening(daysAgo(26), 'Friends', 55, 80, 2, 'Ross and Rachel argued about a letter.', [
      'awkward',
    ]),
  );
  const jasur = byName('Жасур Назаров');
  add(
    jasur,
    listening(
      daysAgo(4),
      'Hidden Brain',
      95,
      null,
      1,
      'The episode explores how an abundance of options paradoxically diminishes satisfaction and leads to decision paralysis.',
      ['abundance', 'paralysis', 'empirical'],
      'Podcast: Hidden Brain — The Paradox of Choice.\nThe episode explores how an abundance of options paradoxically diminishes satisfaction and leads to decision paralysis.\n95% comprehension. Words: abundance, paralysis, empirical.',
    ),
    listening(
      daysAgo(7),
      'Hidden Brain',
      75,
      90,
      2,
      'It was about why we forget dreams, the guest said brain cleans itself at night.',
      ['vivid'],
      'слушал про сон, 75%. It was about why we forget dreams, the guest said brain cleans itself at night, интересно. слова: vivid',
    ),
    reading(daysAgo(10), '1984', 20, 'Уинстон начал дневник', ['telescreen', 'vaporize']),
  );
  const sevara = byName('Севара Мирзаева');
  add(
    sevara,
    listening(
      daysAgo(5),
      'The Great Race',
      60,
      85,
      2,
      'Первое прослушивание ~60%, второе без текста ~85%.',
      ['stubborn', 'resourceful'],
      '#подкастTheGreatRace\nПервое прослушивание: ~60%\nВторое без текста: ~85%\nСколько раз: 2\nНовые слова: stubborn, resourceful',
      true,
    ),
    reading(daysAgo(11), 'Charlotte’s Web', 6, 'Про Фёрн и поросёнка', ['runt', 'barn']),
    listening(
      daysAgo(13),
      'The Great Race',
      50,
      80,
      2,
      'The race was between a hare and a tortoise, the hare cheated.',
      ['cheat'],
    ),
  );
  const bobur = byName('Бобур Алиев');
  add(
    bobur,
    listening(
      daysAgo(13),
      'Marathon podcast',
      80,
      null,
      2,
      'It was about a guy who ran a marathon in the desert and almost gave up but finished.',
      [],
      'слушал подкаст про марафон, 80% с первого раза. It was about a guy who ran a marathon in the desert and almost gave up but finished.',
    ),
    listening(
      daysAgo(19),
      'Economics podcast',
      75,
      null,
      1,
      'The guest explained inflation and why prices go up.',
      ['inflation'],
    ),
    reading(daysAgo(24), 'Sapiens', 15, 'Аграрная революция', ['forager', 'surplus']),
  );
  const dilnoza = byName('Дильноза Ахмедова');
  add(
    dilnoza,
    listening(
      daysAgo(2),
      'BBC Learning English',
      70,
      null,
      2,
      'The episode was about working from home and its advantages and disadvantages.',
      ['commute', 'flexible'],
    ),
    listening(
      daysAgo(5),
      'BBC Learning English',
      70,
      null,
      2,
      'The episode was about working from home and its advantages and disadvantages.',
      ['remote'],
    ),
    listening(
      daysAgo(8),
      'BBC Learning English',
      65,
      null,
      2,
      'The episode was about working from home, advantages and disadvantages.',
      ['productivity'],
    ),
    reading(daysAgo(3), 'Atomic Habits', 14, 'Четыре закона привычек', ['cue', 'reward']),
  );
  const timur = byName('Тимур Рахимов');
  add(
    timur,
    listening(
      daysAgo(3),
      'Privacy podcast',
      85,
      null,
      2,
      'The podcast delineated the ramifications of ubiquitous surveillance, positing that privacy is an increasingly untenable notion.',
      [],
      'The podcast delineated the ramifications of ubiquitous surveillance, positing that privacy is an increasingly untenable notion. 85% с первого раза.',
    ),
    listening(
      daysAgo(6),
      'Privacy podcast',
      80,
      null,
      2,
      'It was about privacy and cameras in cities, the guest said we are watched everywhere.',
      ['surveillance'],
    ),
    reading(daysAgo(9), 'Animal Farm', 18, 'Свиньи взяли власть', ['rebellion', 'windmill']),
    reading(daysAgo(1), 'Animal Farm', 22, 'Строительство мельницы', ['toil', 'ration']),
  );
  const malika = byName('Малика Юсупова');
  add(
    malika,
    reading(daysAgo(0, 8), 'Pride and Prejudice', 30, 'Бал в Незерфилде', ['haughty', 'amiable']),
    reading(daysAgo(2), 'Pride and Prejudice', 28, 'Визит мистера Коллинза', [
      'entail',
      'parsonage',
    ]),
    reading(daysAgo(4), 'Pride and Prejudice', 26, 'Знакомство с Уикхемом', [
      'regiment',
      'militia',
    ]),
    listening(
      daysAgo(1),
      'The Daily',
      90,
      null,
      1,
      'The episode explained how the new tariffs affect small businesses.',
      ['tariff'],
    ),
    listening(
      daysAgo(5),
      'Stuff You Should Know',
      85,
      null,
      1,
      'How bridges are built and why some of them sing in the wind.',
      ['suspension'],
    ),
  );
}

interface F {
  id: string;
  kind: FlagKind;
  status: FlagStatus;
  student: S;
  reason: string;
  reportIndex: number | null;
  daysAgo: number;
}
const FLAGS: F[] = [
  {
    id: uid(),
    kind: 'PCT_JUMP',
    status: 'NEW',
    student: byName('Нилуфар Тошева'),
    reportIndex: 0,
    daysAgo: 3,
    reason:
      'Понимание с первого раза 100% после четырёх отчётов с 60–70%, без объяснений. Возможно, подкаст легче обычного или уже знакомый — стоит спросить.',
  },
  {
    id: uid(),
    kind: 'NORM_MISSED_WEEK',
    status: 'NEW',
    student: byName('Фирдавс Каримов'),
    reportIndex: null,
    daysAgo: 6,
    reason:
      'Неделя без единого отчёта (третья подряд). По правилу Рустама — повод для презентации. Бот только подсвечивает, санкций нет.',
  },
  {
    id: uid(),
    kind: 'TOO_POLISHED',
    status: 'NEW',
    student: byName('Жасур Назаров'),
    reportIndex: 0,
    daysAgo: 4,
    reason:
      'Пересказ выглядит как аннотация: без личных деталей, сложные конструкции, которых раньше не было. Стилистически сильно выше обычного уровня студента.',
  },
  {
    id: uid(),
    kind: 'FORWARDED',
    status: 'NEW',
    student: byName('Севара Мирзаева'),
    reportIndex: 0,
    daysAgo: 5,
    reason:
      'Отчёт переслан из другого чата. Часто это просто копия из заметок — но иногда чужой отчёт.',
  },
  {
    id: uid(),
    kind: 'SPOT_CHECK_FAILED',
    status: 'NEW',
    student: byName('Бобур Алиев'),
    reportIndex: 0,
    daysAgo: 13,
    reason:
      'На вопрос «чем закончился выпуск про марафон?» ответил «не помню, давно было» через день после отчёта. Оценка: VAGUE, второй раз подряд.',
  },
  {
    id: uid(),
    kind: 'REPEATED_RETELLING',
    status: 'NEW',
    student: byName('Дильноза Ахмедова'),
    reportIndex: 0,
    daysAgo: 2,
    reason:
      'Пересказы трёх последних отчётов совпадают на 80%. Возможно, один и тот же выпуск или шаблон.',
  },
  {
    id: uid(),
    kind: 'STYLE_MISMATCH',
    status: 'NEW',
    student: byName('Тимур Рахимов'),
    reportIndex: 0,
    daysAgo: 3,
    reason:
      'В пересказе пять слов уровня C2, которых нет в словаре студента и не было в его текстах. Может быть, просто хорошо подготовился.',
  },
  {
    id: uid(),
    kind: 'FORWARDED',
    status: 'REVIEWED',
    student: byName('Фирдавс Каримов'),
    reportIndex: 0,
    daysAgo: 22,
    reason: 'Отчёт о чтении пришёл пересланным сообщением.',
  },
];

interface Setting {
  key: string;
  def: unknown;
}
const SETTINGS: Setting[] = [
  { key: 'norms.readingPerWeek', def: 3 },
  { key: 'norms.listeningPerWeek', def: 3 },
  { key: 'norms.cardsPerDay', def: 5 },
  { key: 'cards.correctToAdvance', def: 1 },
  { key: 'cards.stage3ToLearned', def: 1 },
  { key: 'reminders.cardsTime', def: '09:00' },
  { key: 'reminders.reportsTime', def: '20:00' },
  { key: 'reminders.tiredDays', def: 5 },
  { key: 'health.yellowInactiveDays', def: 4 },
  { key: 'health.redInactiveDays', def: 8 },
  { key: 'ai.spotCheckProbability', def: 0.2 },
  { key: 'ai.dailyTokenLimitPerStudent', def: 40_000 },
];

export class MockAdminApi implements AdminApi {
  readonly features = { teacherChat: true, parentReport: true };
  private names = new Map<string, string>();
  private archived = new Set<string>();
  private flagStatus = new Map<string, FlagStatus>(FLAGS.map((f) => [f.id, f.status]));
  private levels = new Map<number, GroupLevel>(GROUPS.map((x) => [x.chatId, x.level]));
  private overrides = new Map<string, { value: unknown; updatedAt: string }>();
  private staffRows: StaffMember[] = STAFF.map((s) => ({ ...s }));
  private lists: WordListView[] = [];
  private listWords = new Map<
    string,
    Array<{ id: string; word: string; translation: string | null }>
  >();
  private checkRunning = false;
  private checks: MembershipCheck[] = [
    {
      id: uid(),
      startedAt: '2026-09-01T05:00:00.000Z',
      finishedAt: '2026-09-01T05:02:10.000Z',
      checked: 96,
      archived: 3,
      restored: 1,
      levelChanged: 2,
      failedGroups: [-1005],
    },
    {
      id: uid(),
      startedAt: '2026-08-01T05:00:00.000Z',
      finishedAt: '2026-08-01T05:01:50.000Z',
      checked: 98,
      archived: 2,
      restored: 0,
      levelChanged: 0,
      failedGroups: [],
    },
    {
      id: uid(),
      startedAt: '2026-07-01T05:00:00.000Z',
      finishedAt: '2026-07-01T05:02:30.000Z',
      checked: 94,
      archived: 5,
      restored: 2,
      levelChanged: 4,
      failedGroups: [],
    },
  ];

  constructor(private readonly role: 'OWNER' | 'TEACHER' = 'OWNER') {
    this.createList(
      'Unit 5 — Travel',
      'GROUP',
      g('Upper 16:00').chatId,
      null,
      'itinerary — маршрут\nlayover — пересадка\nboarding pass — посадочный талон\ncustoms — таможня\naisle seat\nturbulence\nresilient — стойкий\nthorough — тщательный\nlook forward to\npostpone — откладывать\ndestination\nsouvenir\nbackpack\nexcursion\nfare\nreservation\ncurrency\nvoyage\nlandmark\nsightseeing',
      {
        studentsAddressed: 17,
        studentsAdded: 11,
        wordsAdded: 96,
        wordsLearned: 3,
        studentsHidden: 2,
      },
    );
    this.createList(
      'Phrasal verbs — базовые',
      'ALL',
      null,
      null,
      'give up — сдаваться\nlook after\nput off\nrun out of\ncarry on\nfind out\nturn down\nset up\nbring up\ncome across\nget along\nlook into\nmake up\npick up\npoint out\nput up with\nshow off\ntake off\nwork out\ncall off\nbreak down\ncheck in\ncome up with\ndrop by\nfigure out\nhang out\nhold on\nkeep up\nlet down\nmove on\npass away\nrun into\nsettle down\nstand for\ntake after',
      {
        studentsAddressed: 96,
        studentsAdded: 60,
        wordsAdded: 540,
        wordsLearned: 14,
        studentsHidden: 5,
      },
    );
    const closed = this.createList(
      'IELTS Writing — linking words',
      'LEVEL',
      null,
      'IELTS',
      'moreover\nfurthermore\nnevertheless\nnonetheless\nconsequently\ntherefore\nwhereas\nalbeit\nnotwithstanding\nhence\nthus\nin contrast\non the contrary\nin addition\nlikewise\nsimilarly\nconversely\nultimately\nadmittedly\narguably\nsubsequently\nmeanwhile\nin summary\nto conclude',
      {
        studentsAddressed: 29,
        studentsAdded: 22,
        wordsAdded: 310,
        wordsLearned: 9,
        studentsHidden: 0,
      },
    );
    closed.status = 'CLOSED';
  }

  private get thresholds(): { warn: number; bad: number } {
    return {
      warn: Number(this.setting('health.yellowInactiveDays')),
      bad: Number(this.setting('health.redInactiveDays')),
    };
  }
  private setting(key: string): unknown {
    return this.overrides.get(key)?.value ?? SETTINGS.find((s) => s.key === key)?.def;
  }
  private get norms(): { reading: number; listening: number } {
    return {
      reading: Number(this.setting('norms.readingPerWeek')),
      listening: Number(this.setting('norms.listeningPerWeek')),
    };
  }
  private assertOwner(): void {
    if (this.role !== 'OWNER')
      throw new ApiError('201953', 'Это действие доступно только владельцу школы.', 403);
  }
  private nameOf(s: S): string {
    return this.names.get(s.id) ?? s.name;
  }
  private ref(s: S): StudentRow['groups'] {
    return [{ chatId: s.group.chatId, title: s.group.title }];
  }
  private healthOf(s: S): Health {
    return healthOf(s, this.thresholds, this.archived.has(s.id));
  }
  private row(s: S): StudentRow {
    const norms = this.norms;
    return {
      id: s.id,
      name: this.nameOf(s),
      firstName: s.name.split(' ')[0],
      lastName: s.name.split(' ')[1] ?? null,
      displayName: this.names.get(s.id) ?? null,
      username: s.username,
      status: this.archived.has(s.id) ? 'ARCHIVED' : 'ACTIVE',
      level: this.levels.get(s.group.chatId) ?? s.group.level,
      groups: this.ref(s),
      health: this.healthOf(s),
      silentDays: s.silent,
      dmBlocked: !!s.blocked,
      lastActivityAt: daysAgo(s.silent).toISOString(),
      registeredAt: '2026-02-03T10:00:00.000Z',
      week: {
        reading: s.r,
        listening: s.l,
        readingNorm: norms.reading,
        listeningNorm: norms.listening,
      },
      words: { total: s.words, learned: s.learned },
      newFlags: FLAGS.filter((f) => f.student === s && this.flagStatus.get(f.id) === 'NEW').length,
    };
  }
  private detail(s: S): StudentDetail {
    const r = this.row(s);
    return {
      ...r,
      telegramUserId: 100_000 + Number(s.id.slice(-2)),
      manualAccess: false,
      archiveReason: this.archived.has(s.id) ? 'MANUAL' : null,
      archivedAt: this.archived.has(s.id) ? new Date().toISOString() : null,
      calmUntil: null,
    };
  }
  private flagView(f: F, withStudent = true): FlagView {
    const report = f.reportIndex === null ? null : (REPORTS[f.student.id]?.[f.reportIndex] ?? null);
    const status = this.flagStatus.get(f.id) ?? f.status;
    return {
      id: f.id,
      kind: f.kind,
      status,
      reason: f.reason,
      createdAt: daysAgo(f.daysAgo, 21).toISOString(),
      reviewedAt: status === 'NEW' ? null : new Date().toISOString(),
      student: withStudent ? this.row(f.student) : null,
      report,
    };
  }
  private card(s: S): StudentCard {
    const norms = this.norms;
    const weeks = weeksBack(6);
    const calendar: Week[] = weeks.map((weekStart, i) => ({
      weekStart,
      reading: { done: s.history[i]?.[0] ?? 0, norm: norms.reading },
      listening: { done: s.history[i]?.[1] ?? 0, norm: norms.listening },
    }));
    const reports = (REPORTS[s.id] ?? [])
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return {
      student: this.detail(s),
      calendar,
      words: {
        total: s.words,
        learning: s.words - s.learned,
        learned: s.learned,
        priority: Math.round(s.words / 5),
        byCefr: {},
        bySource: {},
      },
      flags: FLAGS.filter((f) => f.student === s).map((f) => this.flagView(f, false)),
      recentReports: reports.slice(0, 10).map((r): Report => stripRaw(r)),
      canEdit: this.role === 'OWNER',
    };
  }
  private find(id: string): S {
    const s = STUDENTS.find((x) => x.id === id);
    if (!s) throw new ApiError('203002', 'Студент не найден.', 404);
    return s;
  }
  private createList(
    title: string,
    scope: 'GROUP' | 'LEVEL' | 'ALL',
    groupChatId: number | null,
    level: GroupLevel | null,
    text: string,
    coverage?: Omit<WordListView['coverage'] & object, 'words'>,
  ): WordListView {
    const items = text
      .split(/[\n,;]+/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const [word, translation] = l.split(/\s+[—–-]\s+/);
        return { id: uid(), word: word.trim(), translation: translation?.trim() ?? null };
      });
    const grp =
      groupChatId === null ? null : (GROUPS.find((x) => x.chatId === groupChatId) ?? null);
    const addressed =
      scope === 'ALL'
        ? 96
        : scope === 'LEVEL'
          ? GROUPS.filter((x) => x.level === level).reduce((n, x) => n + x.members, 0)
          : (grp?.members ?? 0);
    const list: WordListView = {
      id: uid(),
      title,
      scope,
      group: grp ? { chatId: grp.chatId, title: grp.title } : null,
      level,
      status: 'ACTIVE',
      createdBy: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      coverage: {
        words: items.length,
        studentsAddressed: addressed,
        studentsAdded: 0,
        wordsAdded: 0,
        wordsLearned: 0,
        studentsHidden: 0,
        ...(coverage ?? {}),
      },
    };
    this.lists.unshift(list);
    this.listWords.set(list.id, items);
    return list;
  }
  private withItems(l: WordListView): WordListView {
    return { ...l, items: this.listWords.get(l.id) ?? [] };
  }

  auth: AdminApi['auth'] = {
    telegramLogin: async () => ({ token: 'demo', roles: [this.role] }),
  };

  overview: AdminApi['overview'] = async (week) => {
    await delay();
    const active = STUDENTS.filter((s) => !this.archived.has(s.id));
    const weeks = weeksBack(10);
    const offset = week === 'last' ? 1 : 0;
    const readingPct = [0.61, 0.57, 0.64, 0.7, 0.66, 0.6, 0.63, 0.58, 0.55, 0.57];
    const listeningPct = [0.48, 0.51, 0.49, 0.52, 0.5, 0.47, 0.44, 0.4, 0.42, 0.41];
    const totals = { good: 0, warn: 0, bad: 0 };
    for (const gr of GROUPS) {
      totals.good += gr.good;
      totals.warn += gr.warn;
      totals.bad += gr.bad;
    }
    const norms = this.norms;
    const top = active
      .map((s) => ({
        s,
        pages: (REPORTS[s.id] ?? [])
          .filter((r) => r.type === 'READING' && r.weekStart === weeks[offset])
          .reduce((n, r) => n + (r.pages ?? 0), 0),
        reports: (REPORTS[s.id] ?? []).filter(
          (r) => r.type === 'READING' && r.weekStart === weeks[offset],
        ).length,
      }))
      .filter((x) => x.pages > 0)
      .sort((a, b) => b.pages - a.pages)
      .slice(0, 3);
    const stats: Overview['stats'] = {
      activeStudents: 96 - this.archived.size,
      archivedStudents: 4 + this.archived.size,
      groups: GROUPS.length,
      readingRate: readingPct[offset],
      readingRateDelta: Math.round((readingPct[offset] - readingPct[offset + 1]) * 100) / 100,
      listeningRate: listeningPct[offset],
      listeningRateDelta: Math.round((listeningPct[offset] - listeningPct[offset + 1]) * 100) / 100,
      cardsThisWeek: offset === 0 ? 1240 : 1315,
      newFlags: FLAGS.filter((f) => this.flagStatus.get(f.id) === 'NEW').length,
    };
    return {
      weekStart: weeks[offset],
      generatedAt: new Date().toISOString(),
      stats,
      healthByGroup: GROUPS.map((gr) => ({
        chatId: gr.chatId,
        title: gr.title,
        level: this.levels.get(gr.chatId) ?? gr.level,
        good: gr.good,
        warn: gr.warn,
        bad: gr.bad,
        members: gr.members,
      })),
      healthTotals: totals,
      history: weeks
        .slice(offset, offset + 8)
        .map((weekStart, i) => ({
          weekStart,
          reading: readingPct[offset + i],
          listening: listeningPct[offset + i],
          students: 96,
        }))
        .reverse(),
      topReaders: top.map(({ s, pages, reports }) => ({ ...this.row(s), pages, reports })),
      attention: active
        .map((s) => ({
          s,
          health: this.healthOf(s),
          noReports: s.history.slice(0, 3).every(([r, l]) => r === 0 && l === 0),
        }))
        .filter((x) => x.noReports || x.health !== 'good')
        .sort(
          (a, b) =>
            Number(b.noReports) - Number(a.noReports) ||
            { bad: 0, warn: 1, good: 2 }[a.health] - { bad: 0, warn: 1, good: 2 }[b.health] ||
            b.s.silent - a.s.silent,
        )
        .map(({ s, health, noReports }) => ({
          ...this.row(s),
          health,
          noReportsForWeeks: noReports ? 3 : 0,
          week: {
            reading: s.r,
            listening: s.l,
            readingNorm: norms.reading,
            listeningNorm: norms.listening,
          },
        })),
    };
  };

  students: AdminApi['students'] = {
    list: async (q) => {
      await delay();
      const rank = { bad: 0, warn: 1, good: 2 };
      const needle = q.q?.trim().toLowerCase();
      return STUDENTS.map((s) => this.row(s))
        .filter((r) => (q.status ? r.status === q.status : r.status !== 'ARCHIVED'))
        .filter((r) => !q.health || r.health === q.health)
        .filter(
          (r) => q.groupChatId === undefined || r.groups.some((x) => x.chatId === q.groupChatId),
        )
        .filter(
          (r) =>
            !needle ||
            r.name.toLowerCase().includes(needle) ||
            (r.username ?? '').toLowerCase().includes(needle),
        )
        .sort((a, b) => rank[a.health] - rank[b.health] || b.silentDays - a.silentDays);
    },
    one: async (id) => {
      await delay();
      return this.card(this.find(id));
    },
    reports: async (id, limit) => {
      await delay();
      const all = (REPORTS[id] ?? [])
        .slice()
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return { data: all.slice(0, limit), meta: { nextCursor: null } };
    },
    words: async (id) => {
      await delay();
      const s = this.find(id);
      const words = (REPORTS[id] ?? []).flatMap((r) => r.wordsAdded.map((w) => ({ w, r })));
      return words
        .map(({ w, r }, i): Word => ({
          id: uid(),
          word: w,
          translation: null,
          example: null,
          cefr: null,
          status: i % 4 === 0 ? 'LEARNED' : 'LEARNING',
          stage: ((i % 3) + 1) as 1 | 2 | 3,
          priority: 'NORMAL',
          source: r.type === 'READING' ? 'READING' : 'PODCAST',
          sourceReportId: r.id,
          sourceListId: null,
          nextDueAt: null,
          createdAt: r.createdAt,
          learnedAt: i % 4 === 0 ? r.createdAt : null,
        }))
        .concat(s.words > words.length ? [] : []);
    },
    rename: async (id, displayName) => {
      this.assertOwner();
      const s = this.find(id);
      if (displayName) this.names.set(id, displayName);
      else this.names.delete(id);
      return this.card(s);
    },
    archive: async (id) => {
      this.assertOwner();
      this.archived.add(id);
      return this.card(this.find(id));
    },
    restore: async (id) => {
      this.assertOwner();
      this.archived.delete(id);
      return this.card(this.find(id));
    },
    recheck: async (id) => {
      await delay(600);
      return { action: 'NONE', levelChanged: false, failedGroups: [], ...this.card(this.find(id)) };
    },
  };

  flags: AdminApi['flags'] = {
    list: async (q) => {
      await delay();
      return FLAGS.map((f) => this.flagView(f))
        .filter((f) => !q.status || f.status === q.status)
        .filter((f) => !q.kind || f.kind === q.kind)
        .filter((f) => !q.studentId || f.student?.id === q.studentId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    one: async (id) => {
      await delay();
      const f = FLAGS.find((x) => x.id === id);
      if (!f) throw new ApiError('213002', 'Флаг не найден.', 404);
      const view = this.flagView(f);
      const previous = view.report
        ? (REPORTS[f.student.id] ?? [])
            .filter((r) => r.type === view.report?.type && r.id !== view.report?.id)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .slice(0, 3)
        : (REPORTS[f.student.id] ?? [])
            .slice()
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .slice(0, 2);
      const detail: FlagDetail = { ...view, previousReports: previous };
      return detail;
    },
    review: async (id, status) => {
      const f = FLAGS.find((x) => x.id === id);
      if (!f) throw new ApiError('213002', 'Флаг не найден.', 404);
      this.flagStatus.set(id, status);
      return this.flagView(f);
    },
  };

  private groupView(gr: G): GroupView {
    const staffName = new Map(this.staffRows.map((s) => [s.telegramUserId, s.name]));
    const pct = {
      '-1001': [0.47, 0.35],
      '-1002': [0.52, 0.4],
      '-1003': [0.68, 0.55],
      '-1004': [0.73, 0.6],
      '-1005': [0.6, 0.52],
      '-1006': [0.57, 0.45],
    }[String(gr.chatId)] ?? [0.5, 0.4];
    return {
      chatId: gr.chatId,
      title: gr.title,
      level: this.levels.get(gr.chatId) ?? gr.level,
      isActive: true,
      members: gr.members,
      teachers: gr.teachers.map((id) => ({ telegramUserId: id, name: staffName.get(id) ?? null })),
      teachersRefreshedAt: daysAgo(1).toISOString(),
      week: { reading: pct[0], listening: pct[1], students: gr.members },
      createdAt: '2026-01-15T08:00:00.000Z',
    };
  }

  groups: AdminApi['groups'] = {
    list: async () => {
      await delay();
      return GROUPS.map((gr) => this.groupView(gr));
    },
    setLevel: async (chatId, level) => {
      this.assertOwner();
      const gr = GROUPS.find((x) => x.chatId === chatId);
      if (!gr) throw new ApiError('202002', 'Группа не найдена.', 404);
      this.levels.set(chatId, level);
      return this.groupView(gr);
    },
    membershipChecks: async () => {
      await delay();
      return this.checks;
    },
    runCheck: async () => {
      this.assertOwner();
      if (this.checkRunning) return { started: false, alreadyRunning: true };
      this.checkRunning = true;
      setTimeout(() => {
        this.checks.unshift({
          id: uid(),
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          checked: 96 - this.archived.size,
          archived: 0,
          restored: 0,
          levelChanged: 0,
          failedGroups: [],
        });
        this.checkRunning = false;
      }, 2500);
      return { started: true, alreadyRunning: false };
    },
  };

  wordLists: AdminApi['wordLists'] = {
    list: async () => {
      await delay();
      return this.lists;
    },
    create: async (dto) => {
      await delay();
      if (dto.scope !== 'GROUP') this.assertOwner();
      return this.withItems(
        this.createList(dto.title, dto.scope, dto.groupChatId ?? null, dto.level ?? null, dto.text),
      );
    },
    one: async (id) => {
      const l = this.lists.find((x) => x.id === id);
      if (!l) throw new ApiError('204002', 'Список не найден.', 404);
      return this.withItems(l);
    },
    patch: async (id, patch) => {
      const l = this.lists.find((x) => x.id === id);
      if (!l) throw new ApiError('204002', 'Список не найден.', 404);
      if (patch.title) l.title = patch.title;
      if (patch.status) l.status = patch.status;
      if (patch.text) {
        const fresh = this.createList(
          l.title,
          l.scope,
          l.group?.chatId ?? null,
          l.level,
          patch.text,
        );
        this.lists = this.lists.filter((x) => x.id !== fresh.id);
        this.listWords.set(l.id, this.listWords.get(fresh.id) ?? []);
        if (l.coverage)
          l.coverage = { ...l.coverage, words: this.listWords.get(l.id)?.length ?? 0 };
      }
      l.updatedAt = new Date().toISOString();
      return this.withItems(l);
    },
  };

  private settingsView(): SettingView[] {
    return SETTINGS.map((s) => {
      const o = this.overrides.get(s.key);
      return {
        key: s.key,
        value: o?.value ?? s.def,
        default: s.def,
        overridden: !!o,
        updatedAt: o?.updatedAt ?? null,
      };
    });
  }

  settings: AdminApi['settings'] = {
    get: async () => {
      this.assertOwner();
      await delay();
      return { keys: SETTINGS.map((s) => s.key), settings: this.settingsView() };
    },
    update: async (values) => {
      this.assertOwner();
      await delay();
      for (const [key, value] of Object.entries(values)) {
        if (!SETTINGS.some((s) => s.key === key))
          throw new ApiError('111001', `Неизвестная настройка: ${key}`, 400);
        this.overrides.set(key, { value, updatedAt: new Date().toISOString() });
      }
      return { settings: this.settingsView() };
    },
    reset: async (key) => {
      this.assertOwner();
      this.overrides.delete(key);
      return { settings: this.settingsView() };
    },
  };

  staff: AdminApi['staff'] = {
    list: async () => {
      await delay();
      return this.staffRows;
    },
    grant: async (dto) => {
      this.assertOwner();
      const existing = this.staffRows.find((s) => s.telegramUserId === dto.telegramUserId);
      if (existing) {
        existing.role = dto.role ?? existing.role;
        existing.name = dto.name ?? existing.name;
      } else
        this.staffRows.push({
          telegramUserId: dto.telegramUserId,
          name: dto.name ?? null,
          role: dto.role ?? 'TEACHER',
          granted: true,
          groups: [],
        });
      return this.staffRows;
    },
    revoke: async (telegramUserId) => {
      this.assertOwner();
      this.staffRows = this.staffRows.filter((s) => s.telegramUserId !== telegramUserId);
      return this.staffRows;
    },
  };

  aiUsage: AdminApi['aiUsage'] = async (month) => {
    this.assertOwner();
    await delay();
    const top = [
      ['Жасур Назаров', 96_000],
      ['Малика Юсупова', 88_000],
      ['Тимур Рахимов', 71_000],
      ['Акмаль Хадиев', 64_000],
      ['Дильноза Ахмедова', 52_000],
    ] as const;
    const usage: AiUsage = {
      month: month ?? new Date().toISOString().slice(0, 7),
      costUsd: 14.2,
      tokens: 2_100_000,
      calls: 3_412,
      perActiveStudentUsd: 0.15,
      byPurpose: [
        { purpose: 'DIALOG', costUsd: 7.9, tokens: 1_200_000, calls: 1_480 },
        { purpose: 'ENRICH_WORDS', costUsd: 2.6, tokens: 410_000, calls: 310 },
        { purpose: 'AUTHENTICITY', costUsd: 2.1, tokens: 330_000, calls: 820 },
        { purpose: 'SENTENCE_CHECK', costUsd: 1.6, tokens: 160_000, calls: 802 },
      ],
      topStudents: top.map(([name, tokens]) => ({
        studentId: byName(name).id,
        name,
        tokens,
        costUsd: Math.round((tokens / 2_100_000) * 14.2 * 100) / 100,
      })),
    };
    return usage;
  };

  ai: AdminApi['ai'] = {
    ask: async (studentId, question) => {
      await delay(900);
      const s = this.find(studentId);
      const first = this.nameOf(s).split(' ')[0];
      const h = this.healthOf(s);
      const q = question.toLowerCase();
      const weakSide = s.l < s.r ? 'аудирование' : s.r < s.l ? 'чтение' : null;
      const weeksMet = (pick: 0 | 1): number =>
        s.history.slice(0, 4).filter((w) => w[pick] >= 3).length;
      let text: string;
      let copyable = false;
      if (/хуже|слаб|трудн/.test(q)) {
        text = weakSide
          ? `Хуже даётся ${weakSide}: на этой неделе ${weakSide === 'аудирование' ? `${s.l}/3 при чтении ${s.r}/3` : `${s.r}/3 при аудировании ${s.l}/3`}, и так несколько недель подряд.\n${weakSide === 'аудирование' ? 'В отчётах об аудировании понимание с первого раза 60–70%, пересказы короткие. Предложите один короткий подкаст (6 Minute English) в середине недели — обычно этого хватает, чтобы норма закрылась.' : 'Страниц мало — по 10–12 за отчёт. Можно предложить книгу полегче или разрешить короткие рассказы.'}`
          : `Обе нормы идут ровно. Слабое место скорее словарь: выучено ${s.learned} из ${s.words}.`;
      } else if (/застря|слов/.test(q)) {
        text =
          'Дольше всего на одной стадии: resourceful (стадия 2, 4 попытки), stubborn (стадия 2, 3 попытки), apparently (стадия 3 — два раза употреблено не по смыслу).\nВсе три из подкастов за август. На уроке можно дать с ними по одному предложению — после верного ответа они уйдут дальше.';
      } else if (/обратн|черновик|фидбек|feedback/.test(q)) {
        copyable = true;
        text = `${first}, за месяц ты прочитал(а) около ${s.history.slice(0, 4).reduce((n, w) => n + w[0], 0) * 14} страниц и добавил(а) ${Math.round(s.words / 3)} слов — это хорошая динамика, так держать.\nПо аудированию норма выполнена ${weeksMet(1)} недели из 4: попробуй один короткий подкаст в середине недели, чтобы не оставлять всё на выходные.\nИз слов задерживаются resourceful и stubborn — составь с ними по предложению, и они уйдут в выученные.`;
      } else {
        text = `За последние 4 недели ${first}: чтение выполнено ${weeksMet(0)} недели из 4, аудирование — ${weeksMet(1)} из 4. Слов в словаре ${s.words}, выучено ${s.learned}. Последняя активность: ${s.silent === 0 ? 'сегодня' : `${s.silent} дн. назад`}.\n${h === 'bad' ? 'Это спад: раньше нормы закрывались стабильно. Стоит поговорить лично.' : h === 'warn' ? 'Темп чуть ниже нормы, но регулярность есть — достаточно одного дополнительного отчёта в неделю.' : 'Стабильный темп, вмешательство не нужно.'}`;
      }
      const reply: ChatReply = { text, copyable };
      return reply;
    },
    parentReport: async (studentId) => {
      await delay(900);
      const s = this.find(studentId);
      const rWeeks = s.history.slice(0, 4).filter((w) => w[0] >= 3).length;
      const lWeeks = s.history.slice(0, 4).filter((w) => w[1] >= 3).length;
      const r = s.history.slice(0, 4).reduce((n, w) => n + w[0], 0);
      const l = s.history.slice(0, 4).reduce((n, w) => n + w[1], 0);
      const book = (REPORTS[s.id] ?? []).find((x) => x.type === 'READING')?.sourceTitle;
      return {
        copyable: true,
        text: `За месяц ${this.nameOf(s)} сдал(а) ${r} отчётов о чтении и ${l} об аудировании: норма по чтению выполнена ${rWeeks} недели из 4, по аудированию — ${lWeeks} из 4. Прочитано около ${r * 14} страниц${book ? ` («${book}»)` : ''}, прослушано ${l} выпусков подкастов. В словарь добавлено ${Math.round(s.words / 3)} слов, ${Math.round(s.learned / 3)} выучено.`,
      };
    },
  };

  ops: AdminApi['ops'] = {
    runReminders: async (kind) => {
      this.assertOwner();
      await delay(800);
      const active = STUDENTS.filter((s) => !this.archived.has(s.id) && !s.blocked);
      const sent =
        kind === 'CARDS'
          ? active.filter((s) => s.silent < 4).length
          : active.filter((s) => s.r < 3 || s.l < 3).length;
      const run: ReminderRun = {
        kind,
        day: isoDay(new Date()),
        candidates: active.length,
        sent,
        skipped: {
          calm: 0,
          done: active.length - sent,
          reminded: 0,
          failed: STUDENTS.filter((s) => s.blocked).length,
          notReportDay: 0,
        },
      };
      return run;
    },
    weeklySummary: async (week) => {
      await delay();
      const o = await this.overview(week);
      const missed = o.attention.filter((a) => a.week.reading === 0 && a.week.listening === 0);
      const groups = o.healthByGroup.map((g) => ({
        chatId: g.chatId,
        title: g.title,
        students: g.members,
        readingRate: 0.4 + (g.good / Math.max(1, g.members)) * 0.5,
        listeningRate: 0.3 + (g.good / Math.max(1, g.members)) * 0.4,
      }));
      const label = weekLabelOf(o.weekStart);
      const lines = [
        `Итоги недели ${label}`,
        `Студентов: ${o.stats.activeStudents}. Норма по чтению — ${Math.round(o.stats.readingRate * 100)}%, по аудированию — ${Math.round(o.stats.listeningRate * 100)}%. Карточек отвечено: ${o.stats.cardsThisWeek}.`,
        `Здоровье: ${o.healthTotals.good} активны · ${o.healthTotals.warn} отстают · ${o.healthTotals.bad} проблемных.`,
        '',
        'По группам:',
        ...groups.map(
          (g) =>
            `• ${g.title} — чтение ${Math.round(g.readingRate * 100)}%, аудирование ${Math.round(g.listeningRate * 100)}% (${g.students})`,
        ),
        '',
        `Ни одного отчёта за неделю — ${missed.length} (повод для презентации):`,
        ...missed.map(
          (m) =>
            `• ${m.name} (${m.groups.map((g) => g.title).join(', ')}) — ${m.silentDays} дн. тишины`,
        ),
        '',
        'Топ читателей:',
        ...o.topReaders.map((t, i) => `${i + 1}. ${t.name} — ${t.pages} стр.`),
        '',
        `Новых флагов на проверку: ${o.stats.newFlags} — откройте дашборд.`,
      ];
      const summary: WeeklySummary = {
        weekStart: o.weekStart,
        weekLabel: label,
        students: o.stats.activeStudents,
        readingRate: o.stats.readingRate,
        readingRateDelta: o.stats.readingRateDelta,
        listeningRate: o.stats.listeningRate,
        listeningRateDelta: o.stats.listeningRateDelta,
        cardsAnswered: o.stats.cardsThisWeek,
        health: o.healthTotals,
        groups,
        missed: missed.map((m) => ({
          id: m.id,
          name: m.name,
          groups: m.groups.map((g) => g.title).join(', '),
          silentDays: m.silentDays,
        })),
        topReaders: o.topReaders.map((t) => ({
          id: t.id,
          name: t.name,
          groups: t.groups.map((g) => g.title).join(', '),
          pages: t.pages,
        })),
        newFlags: o.stats.newFlags,
        text: lines.join('\n'),
      };
      return summary;
    },
    runWeeklySummary: async () => {
      this.assertOwner();
      await delay(800);
      const summary = await this.ops.weeklySummary('last');
      return { summary, flagged: summary.missed.length, sentTo: [1, 777] };
    },
  };
}

function weekLabelOf(weekStart: string): string {
  const start = new Date(`${weekStart}T12:00:00`);
  const end = new Date(start.getTime() + 6 * DAY);
  const m = (x: Date): string =>
    new Intl.DateTimeFormat('ru-RU', { month: 'short' }).format(x).replace('.', '');
  return m(start) === m(end)
    ? `${start.getDate()}–${end.getDate()} ${m(end)}`
    : `${start.getDate()} ${m(start)} – ${end.getDate()} ${m(end)}`;
}
