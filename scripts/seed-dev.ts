/**
 * Demo data for a local run — the people and numbers of the design artboards:
 * one group per level, a dozen students with different "health", reports for
 * the last weeks, vocabularies, a teacher word list, a few flags.
 *
 *   pnpm dev:seed            # idempotent: re-running keeps existing rows
 *   pnpm dev:seed --reset    # wipes students/groups/words/reports/flags first
 *
 * Prints the demo student's id so `pnpm dev:token student <id>` works.
 */
import 'reflect-metadata';
import dataSource from '../ormconfig';
import { FlagKind, FlagStatus } from '../src/domain/flags/flag.enums';
import { Flag } from '../src/domain/flags/flag.entity';
import { Group } from '../src/domain/groups/group.entity';
import { GroupLevel, ListeningMethod, listeningMethodFor } from '../src/domain/groups/level';
import { weekStart } from '../src/domain/norms/week';
import { Report, ReportType } from '../src/domain/reports/report.entity';
import { StudentGroup } from '../src/domain/students/student-group.entity';
import { Student } from '../src/domain/students/student.entity';
import { StudentKind, StudentStatus } from '../src/domain/students/student.enums';
import { lemmaOf } from '../src/domain/words/normalize';
import { WordList, WordListItem } from '../src/domain/words/word-list.entity';
import { Word } from '../src/domain/words/word.entity';
import {
  CardStage,
  CefrLevel,
  WordListScope,
  WordListStatus,
  WordPriority,
  WordSource,
  WordStatus,
} from '../src/domain/words/word.enums';

const TZ = process.env.TZ ?? 'Asia/Tashkent';
const DAY = 86_400_000;
const DEMO_STUDENT_ID = '11111111-1111-4111-8111-111111111111';

const GROUPS: Array<{ chatId: number; title: string; level: GroupLevel }> = [
  { chatId: -1001, title: 'Pre 14:00', level: GroupLevel.PRE_INTERMEDIATE },
  { chatId: -1002, title: 'Inter 18:00', level: GroupLevel.INTERMEDIATE },
  { chatId: -1003, title: 'Upper 16:00', level: GroupLevel.UPPER_INTERMEDIATE },
  { chatId: -1004, title: 'Adv 18:00', level: GroupLevel.ADVANCED },
  { chatId: -1005, title: 'IELTS I', level: GroupLevel.IELTS },
];

/** name, username, group, days silent, reports per week for the last 4 weeks [r,l] newest first, words, learned */
const STUDENTS: Array<{
  id?: string;
  tg: number;
  first: string;
  last: string;
  username: string;
  group: number;
  silent: number;
  weeks: Array<[number, number]>;
  words: number;
  learned: number;
  blocked?: boolean;
}> = [
  { id: DEMO_STUDENT_ID, tg: 4242, first: 'Акмаль', last: 'Хадиев', username: 'akmal_kh', group: -1003, silent: 0, weeks: [[1, 0], [3, 3], [3, 2], [2, 1]], words: 42, learned: 9 },
  { tg: 4243, first: 'Фирдавс', last: 'Каримов', username: 'firdavs_k', group: -1002, silent: 15, weeks: [[0, 0], [0, 0], [0, 0], [1, 1]], words: 31, learned: 4 },
  { tg: 4244, first: 'Бобур', last: 'Алиев', username: 'bobur', group: -1005, silent: 12, weeks: [[0, 0], [0, 0], [1, 0], [2, 1]], words: 58, learned: 12, blocked: true },
  { tg: 4245, first: 'Севара', last: 'Мирзаева', username: 'sevara_m', group: -1001, silent: 9, weeks: [[1, 0], [0, 0], [0, 0], [2, 2]], words: 22, learned: 3 },
  { tg: 4246, first: 'Нилуфар', last: 'Тошева', username: 'nilufar', group: -1003, silent: 3, weeks: [[2, 1], [2, 1], [3, 3], [3, 2]], words: 47, learned: 15 },
  { tg: 4247, first: 'Жасур', last: 'Назаров', username: 'jasur_n', group: -1004, silent: 4, weeks: [[1, 1], [2, 2], [3, 3], [3, 3]], words: 90, learned: 40 },
  { tg: 4248, first: 'Малика', last: 'Юсупова', username: 'malika_y', group: -1004, silent: 0, weeks: [[3, 2], [3, 3], [3, 3], [3, 3]], words: 120, learned: 64 },
  { tg: 4249, first: 'Тимур', last: 'Рахимов', username: 'timur_r', group: -1003, silent: 1, weeks: [[2, 2], [3, 3], [3, 2], [2, 3]], words: 76, learned: 30 },
  { tg: 4250, first: 'Дильноза', last: 'Ахмедова', username: 'dilnoza', group: -1005, silent: 1, weeks: [[2, 1], [3, 3], [2, 3], [3, 3]], words: 64, learned: 22 },
];

const VOCAB: Array<[string, string, CefrLevel]> = [
  ['postpone', 'откладывать', CefrLevel.B1], ['diligent', 'прилежный, старательный', CefrLevel.B2],
  ['stubborn', 'упрямый', CefrLevel.B1], ['resourceful', 'находчивый', CefrLevel.B2],
  ['drowsy', 'сонный', CefrLevel.B2], ['wand', 'волшебная палочка', CefrLevel.B1],
  ['muggle', 'магл, не волшебник', CefrLevel.C1], ['enchanted', 'зачарованный', CefrLevel.B2],
  ['apparently', 'по-видимому', CefrLevel.B1], ['cheat', 'мухлевать, жульничать', CefrLevel.A2],
  ['nap', 'короткий дневной сон', CefrLevel.A2], ['resilient', 'стойкий, жизнестойкий', CefrLevel.C1],
  ['gloomy', 'мрачный', CefrLevel.B2], ['keen', 'увлечённый', CefrLevel.B1], ['whisper', 'шептать', CefrLevel.A2],
  ['accomplish', 'достигать', CefrLevel.B2], ['ambiguous', 'двусмысленный', CefrLevel.C1], ['bargain', 'выгодная покупка', CefrLevel.B1],
  ['brisk', 'бодрый, быстрый', CefrLevel.B2], ['candid', 'откровенный', CefrLevel.C1], ['coherent', 'связный', CefrLevel.C1],
  ['cosy', 'уютный', CefrLevel.B1], ['crave', 'жаждать', CefrLevel.B2], ['deceive', 'обманывать', CefrLevel.B2],
  ['devoted', 'преданный', CefrLevel.B2], ['eager', 'нетерпеливый, жаждущий', CefrLevel.B1], ['elaborate', 'подробный', CefrLevel.B2],
  ['fierce', 'свирепый', CefrLevel.B2], ['flourish', 'процветать', CefrLevel.C1], ['fragile', 'хрупкий', CefrLevel.B1],
  ['genuine', 'подлинный', CefrLevel.B2], ['grasp', 'схватывать, понимать', CefrLevel.B2], ['hesitate', 'колебаться', CefrLevel.B1],
  ['insist', 'настаивать', CefrLevel.B1], ['jealous', 'ревнивый', CefrLevel.B1], ['leisure', 'досуг', CefrLevel.B1],
  ['mature', 'зрелый', CefrLevel.B2], ['neglect', 'пренебрегать', CefrLevel.B2], ['obvious', 'очевидный', CefrLevel.A2],
  ['reluctant', 'неохотный', CefrLevel.B2], ['thorough', 'тщательный', CefrLevel.B2], ['overwhelmed', 'перегруженный', CefrLevel.B2],
  ['sincere', 'искренний', CefrLevel.B1], ['vivid', 'яркий', CefrLevel.B2], ['weary', 'уставший', CefrLevel.C1],
  ['abandon', 'покидать', CefrLevel.B1], ['adapt', 'приспосабливаться', CefrLevel.B1], ['appeal', 'привлекательность', CefrLevel.B2],
  ['assume', 'предполагать', CefrLevel.B1], ['blame', 'винить', CefrLevel.B1], ['boast', 'хвастаться', CefrLevel.B2],
  ['burden', 'бремя', CefrLevel.B2], ['cautious', 'осторожный', CefrLevel.B1], ['chaos', 'хаос', CefrLevel.B1],
  ['clumsy', 'неуклюжий', CefrLevel.B1], ['compel', 'принуждать', CefrLevel.C1], ['conceal', 'скрывать', CefrLevel.C1],
  ['curious', 'любопытный', CefrLevel.A2], ['decent', 'приличный', CefrLevel.B1], ['dim', 'тусклый', CefrLevel.B1],
];

const TEACHER_LIST = [
  'itinerary — маршрут, план поездки', 'layover — пересадка', 'boarding pass — посадочный талон', 'customs — таможня',
  'accommodation — жильё', 'sightseeing — осмотр достопримечательностей', 'jet lag — сбой биоритма', 'commute — ездить на работу',
  'detour — объезд', 'souvenir — сувенир', 'delayed — задержанный', 'backpacker — турист с рюкзаком',
  'resilient — стойкий', 'postpone — откладывать', 'stubborn — упрямый', 'apparently — по-видимому',
  'drowsy — сонный', 'nap — короткий сон', 'cheat — жульничать', 'wand — волшебная палочка',
];

function at(daysAgo: number, hour: number): Date {
  const d = new Date(Date.now() - daysAgo * DAY);
  d.setUTCHours(hour - 5, 0, 0, 0); // hour in Asia/Tashkent
  return d;
}

async function main(): Promise<void> {
  const ds = await dataSource.initialize();
  const reset = process.argv.includes('--reset');
  if (reset) {
    await ds.query('TRUNCATE flags, spot_checks, word_list_dismissals, word_list_items, word_lists, words, reports, student_groups, students, groups, membership_checks, ai_usage, ai_messages, reminder_log, card_attempts, word_imports CASCADE');
    console.log('reset: tables truncated');
  }
  const groups = ds.getRepository(Group);
  const students = ds.getRepository(Student);
  const links = ds.getRepository(StudentGroup);
  const reports = ds.getRepository(Report);
  const words = ds.getRepository(Word);
  const flags = ds.getRepository(Flag);
  const lists = ds.getRepository(WordList);
  const items = ds.getRepository(WordListItem);

  for (const g of GROUPS) {
    if (!(await groups.findOne({ where: { chatId: g.chatId } })))
      await groups.save(groups.create({ ...g, isActive: true, teacherTelegramIds: g.chatId === -1003 || g.chatId === -1005 ? [777] : [] }));
  }

  const now = new Date();
  let created = 0;
  for (const s of STUDENTS) {
    if (await students.findOne({ where: { telegramUserId: s.tg } })) continue;
    const group = GROUPS.find((g) => g.chatId === s.group) as (typeof GROUPS)[number];
    const student = await students.save(
      students.create({
        ...(s.id ? { id: s.id } : {}),
        telegramUserId: s.tg,
        firstName: s.first,
        lastName: s.last,
        username: s.username,
        kind: StudentKind.STUDENT,
        status: StudentStatus.ACTIVE,
        level: group.level,
        manualAccess: false,
        dialogState: {},
        dmBlocked: s.blocked ?? false,
        lastActivityAt: new Date(now.getTime() - s.silent * DAY),
        registeredAt: new Date(now.getTime() - 60 * DAY),
      }),
    );
    await links.save(links.create({ studentId: student.id, groupChatId: s.group, isMember: true, joinedAt: student.registeredAt, checkedAt: now }));

    // Reports: spread over the week (Mon, Wed, Fri for reading; Tue, Thu, Sun for listening), newest week first.
    const method = listeningMethodFor(group.level);
    const rows: Report[] = [];
    s.weeks.forEach(([r, l], weekIdx) => {
      const monday = new Date(`${weekStart(new Date(now.getTime() - weekIdx * 7 * DAY), TZ)}T07:00:00Z`);
      const readingDays = [0, 2, 4].slice(0, r);
      const listeningDays = [1, 3, 6].slice(0, l);
      for (const d of readingDays) {
        const when = new Date(monday.getTime() + d * DAY);
        if (when > now) continue;
        const pages = 8 + ((s.tg + d) % 12);
        rows.push(reports.create({
          studentId: student.id, type: ReportType.READING, method: null,
          rawText: `прочитал ${pages} страниц Harry Potter and the Philosopher’s Stone, слова: wand, muggle`,
          sourceTitle: 'Harry Potter and the Philosopher’s Stone', episode: null, pages,
          summary: 'Гарри узнаёт, что он волшебник', firstPassPct: null, secondPassPct: null, listenCount: null,
          unclearParts: [], parsed: null, wordsAdded: 2, weekStart: weekStart(when, TZ), isForwarded: false, createdAt: when,
        }));
      }
      for (const d of listeningDays) {
        const when = new Date(monday.getTime() + d * DAY);
        if (when > now) continue;
        rows.push(reports.create({
          studentId: student.id, type: ReportType.LISTENING, method,
          rawText: 'слушал 6 Minute English про сон, с первого раза 70%, после третьего 88%, слушал 3 раза. The episode was about why we sleep. слова: drowsy, nap',
          sourceTitle: '6 Minute English — Why do we sleep?', episode: null, pages: null,
          summary: 'The episode was about why we sleep. The hosts said that a short nap helps memory.',
          firstPassPct: 70, secondPassPct: 88, listenCount: 3, unclearParts: ['sleep debt'], parsed: null, wordsAdded: 2,
          weekStart: weekStart(when, TZ), isForwarded: false, createdAt: when,
        }));
      }
    });
    if (rows.length) await reports.save(rows);

    // Vocabulary: take `words` entries, mark `learned` of them as LEARNED, a few HIGH priority.
    const vocab = VOCAB.slice(0, Math.min(s.words, VOCAB.length)).map(([word, translation, cefr], i) => {
      const learned = i < s.learned;
      const createdAt = at(3 + (i % 20), 12);
      return words.create({
        studentId: student.id, word, lemma: lemmaOf(word), translation, cefr,
        example: `I used the word "${word}" in a sentence.`,
        status: learned ? WordStatus.LEARNED : WordStatus.LEARNING,
        priority: !learned && i % 7 === 0 ? WordPriority.HIGH : WordPriority.NORMAL,
        stage: learned ? CardStage.OWN_SENTENCE : ((i % 3) + 1 as CardStage),
        stageCorrect: 0, correctTotal: learned ? 3 : i % 3,
        nextDueAt: learned ? createdAt : new Date(now.getTime() - (i % 2) * DAY),
        source: i % 7 === 0 ? WordSource.MANUAL : i % 2 === 0 ? WordSource.READING : WordSource.PODCAST,
        sourceReportId: null, sourceListId: null, createdAt, learnedAt: learned ? at(1, 12) : null,
      });
    });
    if (vocab.length) await words.save(vocab);
    created += 1;
  }

  // Teacher list for Upper 16:00 (only once).
  if (!(await lists.findOne({ where: { title: 'Unit 5 — Travel' } }))) {
    const list = await lists.save(lists.create({ title: 'Unit 5 — Travel', scope: WordListScope.GROUP, groupChatId: -1003, level: null, createdBy: 777, status: WordListStatus.ACTIVE }));
    await items.save(TEACHER_LIST.map((line, position) => {
      const [word, translation] = line.split(' — ');
      return items.create({ listId: list.id, word, lemma: lemmaOf(word), translation, position });
    }));
  }

  // Flags on the problem students.
  const byUsername = async (u: string): Promise<Student | null> => students.findOne({ where: { username: u } });
  const flagRows: Array<[string, FlagKind, string]> = [
    ['firdavs_k', FlagKind.NORM_MISSED_WEEK, 'Неделя без единого из 6 отчётов — повод для презентации по правилу Рустама.'],
    ['nilufar', FlagKind.PCT_JUMP, 'Понимание с первого раза 100% после обычных 60–70%, без объяснений.'],
    ['jasur_n', FlagKind.TOO_POLISHED, 'Пересказ выглядит как аннотация: без личных деталей, конструкции выше обычного уровня.'],
  ];
  for (const [u, kind, reason] of flagRows) {
    const st = await byUsername(u);
    if (!st) continue;
    if (await flags.findOne({ where: { studentId: st.id, kind } })) continue;
    const report = await reports.findOne({ where: { studentId: st.id }, order: { createdAt: 'DESC' } });
    await flags.save(flags.create({ studentId: st.id, reportId: report?.id ?? null, kind, reason, status: FlagStatus.NEW }));
  }

  console.log(`seeded: ${created} new students (${STUDENTS.length} total in the demo set)`);
  console.log(`demo student id: ${DEMO_STUDENT_ID}  (pnpm dev:token student ${DEMO_STUDENT_ID})`);
  console.log(`teacher telegram id: 777  (pnpm dev:token teacher 777) — groups Upper 16:00, IELTS I`);
  await ds.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
