import { AdminRole } from '../admins/admin.entity';
import { Flag } from '../flags/flag.entity';
import { FlagKind, FlagStatus } from '../flags/flag.enums';
import { Student } from '../students/student.entity';
import { StudentStatus } from '../students/student.enums';
import { weekLabel, WeeklySummaryService } from './weekly-summary.service';

const TZ = 'Asia/Tashkent';
// Monday 09:00 local, 12 Oct 2026 → last week = 5–11 Oct.
const NOW = new Date('2026-10-12T04:00:00Z');

function student(id: string, name: string, lastActivityAt: Date | null): Student {
  return Object.assign(new Student(), {
    id,
    telegramUserId: Number(id.replace('s', '')),
    firstName: name.split(' ')[0],
    lastName: name.split(' ')[1],
    displayName: null,
    status: StudentStatus.ACTIVE,
    dialogState: {},
    dmBlocked: false,
    registeredAt: new Date('2026-02-01T00:00:00Z'),
    lastActivityAt,
  });
}

describe('WeeklySummaryService', () => {
  const students = [
    student('s1', 'Малика Юсупова', new Date('2026-10-11T10:00:00Z')),
    student('s2', 'Фирдавс Каримов', new Date('2026-09-27T10:00:00Z')),
    student('s3', 'Акмаль Хадиев', new Date('2026-10-10T10:00:00Z')),
  ];
  const counts = new Map([
    ['s1|2026-10-05', { reading: 3, listening: 3 }],
    ['s3|2026-10-05', { reading: 3, listening: 1 }],
    ['s1|2026-09-28', { reading: 3, listening: 3 }],
    ['s2|2026-09-28', { reading: 1, listening: 0 }],
  ]);
  const raised: Array<{ studentId: string; kind: FlagKind; reason: string }> = [];
  const sent: Array<{ to: number; text: string }> = [];

  const service = new WeeklySummaryService(
    {
      findAll: async () => students,
      memberGroupIdsFor: async () =>
        new Map([
          ['s1', [-1004]],
          ['s2', [-1002]],
          ['s3', [-1003]],
        ]),
      findByGroups: async (ids: number[]) =>
        students.filter((s) => (s.id === 's3' ? ids.includes(-1003) : false)),
    } as never,
    {
      findAllActive: async () => [
        { chatId: -1002, title: 'Inter 18:00' },
        { chatId: -1003, title: 'Upper 16:00' },
        { chatId: -1004, title: 'Adv 18:00' },
      ],
    } as never,
    {
      countsByWeek: async () => counts,
      topReaders: async () => [{ studentId: 's1', pages: 84, reports: 3 }],
    } as never,
    {
      list: async (filter: { kind?: FlagKind; studentId?: string }) =>
        filter.kind === FlagKind.NORM_MISSED_WEEK
          ? raised
              .filter((r) => r.studentId === filter.studentId)
              .map((r) => Object.assign(new Flag(), { ...r, status: FlagStatus.NEW }))
          : [Object.assign(new Flag(), { createdAt: new Date('2026-10-08T00:00:00Z') })],
      raise: async (input: { studentId: string; kind: FlagKind; reason: string }) => {
        raised.push(input);
        return input;
      },
    } as never,
    { countAnswered: async () => 42 } as never,
    {
      ownerTelegramId: 1,
      listStaff: async () => [
        { telegramUserId: 1, role: AdminRole.OWNER, groups: [] },
        {
          telegramUserId: 777,
          role: AdminRole.TEACHER,
          groups: [{ chatId: -1003, title: 'Upper 16:00' }],
        },
      ],
    } as never,
    { timezone: TZ } as never,
    {
      sendToUser: async (to: number, text: string) => {
        sent.push({ to, text });
        return true;
      },
    },
  );

  it('builds last week: rates with deltas, health, groups, no-shows, top readers', async () => {
    const s = await service.build(NOW, 1);
    expect(s.weekStart).toBe('2026-10-05');
    expect(s.weekLabel).toBe('5–11 окт');
    expect(s.students).toBe(3);
    expect(s.readingRate).toBeCloseTo(0.67);
    expect(s.listeningRate).toBeCloseTo(0.33);
    expect(s.readingRateDelta).toBeCloseTo(0.34);
    expect(s.cardsAnswered).toBe(42);
    expect(s.health).toEqual({ good: 2, warn: 0, bad: 1 });
    expect(s.groups.map((g) => [g.title, g.students, g.readingRate])).toEqual([
      ['Inter 18:00', 1, 0],
      ['Upper 16:00', 1, 1],
      ['Adv 18:00', 1, 1],
    ]);
    expect(s.missed).toEqual([
      { id: 's2', name: 'Фирдавс Каримов', groups: 'Inter 18:00', silentDays: 14 },
    ]);
    expect(s.topReaders[0]).toMatchObject({ name: 'Малика Юсупова', pages: 84 });
    expect(s.newFlags).toBe(1);
  });

  it('run(): raises NORM_MISSED_WEEK once per week and sends the owner and the teachers their scope', async () => {
    const first = await service.run(NOW);
    expect(first.flagged).toBe(1);
    expect(raised[0]).toMatchObject({ studentId: 's2', kind: FlagKind.NORM_MISSED_WEEK });
    expect(raised[0].reason).toContain('5–11 окт');
    expect(first.sentTo).toEqual([1, 777]);
    expect(sent[0].text).toContain('Итоги недели 5–11 окт');
    expect(sent[0].text).toContain('Фирдавс Каримов (Inter 18:00) — 14 дней тишины');
    expect(sent[0].text).toContain('Новых флагов на проверку');
    // The teacher's copy covers only their group.
    expect(sent[1].text).toContain('Студентов: 1');
    expect(sent[1].text).not.toContain('Фирдавс');
    expect(sent[1].text).not.toContain('Новых флагов');

    const second = await service.run(NOW);
    expect(second.flagged).toBe(0);
  });

  it('weekLabel spans months', () => {
    expect(weekLabel('2026-09-28')).toBe('28 сен – 4 окт');
  });
});
