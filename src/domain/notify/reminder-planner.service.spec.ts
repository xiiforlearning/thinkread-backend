import { globalConfig } from '../../config/global.config';
import { ReminderKind } from '../norms/reminder-log.entity';
import { Student } from '../students/student.entity';
import { NotifyOptions } from './notifier.port';
import { ReminderPlannerService } from './reminder-planner.service';

const TZ = 'Asia/Tashkent';
// Thursday 19:05 local (reportDays = [4, 6]).
const NOW = new Date('2026-10-08T14:05:00Z');

function student(over: Partial<Student> = {}): Student {
  return Object.assign(new Student(), {
    id: `s-${over.telegramUserId ?? 1}`,
    telegramUserId: 1,
    dialogState: {},
    dmBlocked: false,
    ...over,
  });
}

interface Fakes {
  students: Student[];
  reminded: Map<string, ReminderKind[]>;
  cards: Record<string, { done: number; due: number }>;
  progress: Record<string, { reading: number; listening: number }>;
  sent: Array<{ to: number; text: string; options?: NotifyOptions }>;
  blocked: Set<number>;
}

function planner(f: Fakes): ReminderPlannerService {
  const marked: Array<{ id: string; kind: ReminderKind }> = [];
  return new ReminderPlannerService(
    { findActive: async () => f.students } as never,
    {
      pendingToday: async (id: string) =>
        Object.values(ReminderKind).filter(
          (k) =>
            !(f.reminded.get(id) ?? []).includes(k) &&
            !marked.some((m) => m.id === id && m.kind === k),
        ),
      mark: async (id: string, kind: ReminderKind) => {
        marked.push({ id, kind });
      },
    } as never,
    {
      weekProgress: async (id: string) => ({
        weekStart: '2026-10-05',
        ...(f.progress[id] ?? { reading: 0, listening: 0 }),
        readingNorm: 3,
        listeningNorm: 3,
      }),
    } as never,
    {
      today: async (id: string) => ({ done: f.cards[id]?.done ?? 0, correct: 0, norm: 5 }),
      queue: async (id: string) => Array.from({ length: f.cards[id]?.due ?? 0 }, () => ({})),
    } as never,
    { timezone: TZ } as never,
    {
      sendToUser: async (to: number, text: string, options?: NotifyOptions) => {
        if (f.blocked.has(to)) return false;
        f.sent.push({ to, text, options });
        return true;
      },
    },
  );
}

function fakes(over: Partial<Fakes> = {}): Fakes {
  return {
    students: [],
    reminded: new Map(),
    cards: {},
    progress: {},
    sent: [],
    blocked: new Set(),
    ...over,
  };
}

describe('ReminderPlannerService', () => {
  it('cards: reminds only students with due cards below the daily norm, with the app button', async () => {
    const f = fakes({
      students: [
        student({ telegramUserId: 1 }), // due, not done
        student({ telegramUserId: 2 }), // norm met
        student({ telegramUserId: 3 }), // nothing due
      ],
      cards: { 's-1': { done: 2, due: 7 }, 's-2': { done: 5, due: 3 }, 's-3': { done: 0, due: 0 } },
    });
    const run = await planner(f).runCards(NOW);
    expect(run).toMatchObject({ kind: 'CARDS', day: '2026-10-08', candidates: 3, sent: 1 });
    expect(run.skipped.done).toBe(2);
    expect(f.sent).toHaveLength(1);
    expect(f.sent[0].to).toBe(1);
    expect(f.sent[0].text).toContain('3 слова'); // min(due 7, norm 5 − done 2)
    expect(f.sent[0].options).toEqual({ openApp: true });
  });

  it('cards: skips calm mode, already-reminded (woven counts) and blocked students', async () => {
    const f = fakes({
      students: [
        student({ telegramUserId: 1, dialogState: { tiredUntil: '2026-10-20T00:00:00Z' } }),
        student({ telegramUserId: 2 }),
        student({ telegramUserId: 3 }),
      ],
      cards: { 's-1': { done: 0, due: 5 }, 's-2': { done: 0, due: 5 }, 's-3': { done: 0, due: 5 } },
      reminded: new Map([['s-2', [ReminderKind.CARDS]]]),
      blocked: new Set([3]),
    });
    const run = await planner(f).runCards(NOW);
    expect(run.sent).toBe(0);
    expect(run.skipped).toMatchObject({ calm: 1, reminded: 1, failed: 1 });
    expect(f.sent).toHaveLength(0);
  });

  it('reports: on a report day lists only what is missing and marks each kind', async () => {
    const f = fakes({
      students: [student({ telegramUserId: 1 }), student({ telegramUserId: 2 })],
      progress: { 's-1': { reading: 1, listening: 3 }, 's-2': { reading: 3, listening: 3 } },
    });
    const run = await planner(f).runReports(NOW);
    expect(run.sent).toBe(1);
    expect(run.skipped.done).toBe(1);
    expect(f.sent[0].text).toContain('чтение — ещё 2 из 3');
    expect(f.sent[0].text).not.toContain('аудирование');
    expect(f.sent[0].text).toContain('До конца недели 4 дня'); // Thursday
  });

  it('reports: silent outside report days unless forced', async () => {
    const monday = new Date('2026-10-05T14:05:00Z');
    const f = fakes({
      students: [student({ telegramUserId: 1 })],
      progress: { 's-1': { reading: 0, listening: 0 } },
    });
    expect(globalConfig.reminders.reportDays).toEqual([4, 6]);
    const quiet = await planner(f).runReports(monday);
    expect(quiet.sent).toBe(0);
    expect(quiet.skipped.notReportDay).toBe(1);
    const forced = await planner(f).runReports(monday, true);
    expect(forced.sent).toBe(1);
    expect(f.sent[0].text).toContain('7 дней');
  });
});
