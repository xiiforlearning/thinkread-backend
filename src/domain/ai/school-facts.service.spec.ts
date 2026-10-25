import { globalConfig } from '../../config/global.config';
import { Student } from '../students/student.entity';
import { StudentStatus } from '../students/student.enums';
import { GroupLevel } from '../groups/level';
import { SchoolFactsService } from './school-facts.service';

const NOW = new Date('2026-10-21T10:00:00Z'); // Wednesday; week of 2026-10-19

function student(id: string, name: string, extra: Partial<Student> = {}): Student {
  return Object.assign(new Student(), {
    id,
    firstName: name,
    lastName: null,
    status: StudentStatus.ACTIVE,
    level: GroupLevel.UPPER_INTERMEDIATE,
    dmBlocked: false,
    registeredAt: new Date('2026-09-01T00:00:00Z'),
    lastActivityAt: NOW,
    ...extra,
  });
}

function make(): SchoolFactsService {
  const akmal = student('s1', 'Акмаль');
  const firdavs = student('s2', 'Фирдавс', {
    lastActivityAt: new Date('2026-10-06T00:00:00Z'),
    level: GroupLevel.IELTS,
  });
  const counts = new Map<string, { reading: number; listening: number }>([
    ['s1|2026-10-12', { reading: 3, listening: 1 }],
    ['s1|2026-10-19', { reading: 1, listening: 0 }],
    ['s2|2026-10-05', { reading: 1, listening: 0 }],
  ]);
  return new SchoolFactsService(
    {
      findAll: async () => [akmal, firdavs],
      memberGroupIdsFor: async () =>
        new Map([
          ['s1', [-1]],
          ['s2', [-2]],
        ]),
    } as never,
    {
      findAllActive: async () => [
        { chatId: -1, title: 'Upper 16:00', level: GroupLevel.UPPER_INTERMEDIATE },
        { chatId: -2, title: 'IELTS I', level: GroupLevel.IELTS },
      ],
    } as never,
    {
      countsByWeek: async () => counts,
      topReaders: async () => [{ studentId: 's1', pages: 40, reports: 1 }],
    } as never,
    { countsFor: async () => new Map([['s1', { total: 42, learned: 9 }]]) } as never,
    { countNewByStudent: async () => new Map([['s2', 1]]) } as never,
    { timezone: 'Asia/Tashkent' } as never,
  );
}

describe('SchoolFactsService', () => {
  const startsOn = globalConfig.norms.startsOn;
  beforeAll(() => (globalConfig.norms.startsOn = ''));
  afterAll(() => (globalConfig.norms.startsOn = startsOn));

  it('collects the whole school: weeks oldest first, per-student norms, groups and the no-shows', async () => {
    const facts = await make().collect({ studentIds: null, groupIds: null }, NOW);
    expect(facts.scope).toBe('school');
    expect(facts.period.weeks).toEqual(['2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19']);
    expect(facts.period.currentWeek).toBe('2026-10-19');
    expect(facts.totals.students).toBe(2);
    expect(facts.totals.health).toEqual({ good: 1, warn: 0, bad: 1 });
    expect(facts.totals.flagsNew).toBe(1);
    const akmal = facts.students.find((s) => s.name === 'Акмаль');
    expect(akmal).toMatchObject({
      groups: 'Upper 16:00',
      level: 'Upper-Intermediate',
      health: 'good',
      weeks: [
        [0, 0],
        [0, 0],
        [3, 1],
        [1, 0],
      ],
      metReading: 1,
      metListening: 0,
      words: { total: 42, learned: 9 },
      flagsNew: 0,
    });
    expect(facts.groups.map((g) => [g.title, g.students, g.weeks[2].reading])).toEqual([
      ['Upper 16:00', 1, 1],
      ['IELTS I', 1, 0],
    ]);
    expect(facts.missedThisWeek).toEqual(['Фирдавс']);
    expect(facts.topReadersThisWeek).toEqual([{ name: 'Акмаль', pages: 40 }]);
  });

  it("limits a teacher's facts to their groups' students", async () => {
    const facts = await make().collect({ studentIds: ['s2'], groupIds: [-2] }, NOW);
    expect(facts.scope).toBe('groups');
    expect(facts.students.map((s) => s.name)).toEqual(['Фирдавс']);
    expect(facts.groups.map((g) => g.title)).toEqual(['IELTS I']);
    expect(facts.totals.students).toBe(1);
  });
});
