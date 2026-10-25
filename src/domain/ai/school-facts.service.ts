import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../../config/config.service';
import { globalConfig } from '../../config/global.config';
import { FlagsService } from '../flags/flags.service';
import { LEVEL_LABELS } from '../groups/messages';
import { GroupsService } from '../groups/groups.service';
import { recentWeekStarts } from '../norms/week';
import { ReportsService } from '../reports/reports.service';
import { Health, healthOf, silentDays } from '../students/health';
import { displayNameOf } from '../students/name-validation';
import { Student } from '../students/student.entity';
import { StudentStatus } from '../students/student.enums';
import { StudentsService } from '../students/students.service';
import { WordsService } from '../words/words.service';
import { weekLabel } from '../notify/weekly-summary.service';

/** Who the caller may see: the owner everything (both null), a teacher only their groups. */
export interface SchoolScope {
  studentIds: string[] | null;
  groupIds: number[] | null;
}

export interface SchoolWeekRate {
  week: string;
  label: string;
  /** Share of the students who met the norm, 0–1. */
  reading: number;
  listening: number;
}

export interface SchoolStudentFacts {
  id: string;
  name: string;
  groups: string;
  level: string | null;
  health: Health;
  silentDays: number;
  blockedBot: boolean;
  /** Reports per week, oldest week first: [reading, listening]. */
  weeks: Array<[number, number]>;
  /** Weeks of the period where the norm was met. */
  metReading: number;
  metListening: number;
  words: { total: number; learned: number };
  flagsNew: number;
}

export interface SchoolGroupFacts {
  chatId: number;
  title: string;
  level: string | null;
  students: number;
  health: Record<Health, number>;
  weeks: SchoolWeekRate[];
}

/**
 * Everything the school-wide AI may say about the school or a teacher's groups — numbers the
 * system computed for the last `weeks` weeks (current week included, oldest first). The model
 * only explains and compares; it never sees report texts.
 */
export interface SchoolFacts {
  scope: 'school' | 'groups';
  period: { weeks: string[]; labels: string[]; currentWeek: string; weeksOf: number };
  norms: { readingPerWeek: number; listeningPerWeek: number; cardsPerDay: number };
  totals: {
    students: number;
    health: Record<Health, number>;
    flagsNew: number;
    weeks: SchoolWeekRate[];
  };
  groups: SchoolGroupFacts[];
  students: SchoolStudentFacts[];
  /** Nobody handed anything in this week (so far). */
  missedThisWeek: string[];
  topReadersThisWeek: Array<{ name: string; pages: number }>;
}

const DEFAULT_WEEKS = 4;

@Injectable()
export class SchoolFactsService {
  constructor(
    private readonly students: StudentsService,
    private readonly groups: GroupsService,
    private readonly reports: ReportsService,
    private readonly words: WordsService,
    private readonly flags: FlagsService,
    private readonly config: AppConfigService,
  ) {}

  async collect(scope: SchoolScope, now = new Date(), weeks = DEFAULT_WEEKS): Promise<SchoolFacts> {
    const tz = this.config.timezone;
    const starts = recentWeekStarts(now, tz, weeks).reverse(); // oldest → current
    const current = starts[starts.length - 1];
    const all = await this.students.findAll({ statuses: [StudentStatus.ACTIVE] });
    const active = scope.studentIds ? all.filter((s) => scope.studentIds?.includes(s.id)) : all;
    const ids = active.map((s) => s.id);
    const [counts, groupsAll, byStudent, wordCounts, flagsNew, topRaw] = await Promise.all([
      this.reports.countsByWeek(ids, starts),
      this.groups.findAllActive(),
      this.students.memberGroupIdsFor(ids),
      this.words.countsFor(ids),
      this.flags.countNewByStudent(ids),
      this.reports.topReaders(ids, current, 5),
    ]);
    const groups = scope.groupIds
      ? groupsAll.filter((g) => scope.groupIds?.includes(g.chatId))
      : groupsAll;
    const title = new Map(groups.map((g) => [g.chatId, g.title]));
    const norms = globalConfig.norms;
    const cell = (id: string, w: string): { reading: number; listening: number } =>
      counts.get(`${id}|${w}`) ?? { reading: 0, listening: 0 };
    const rate = (list: Student[], w: string, pick: 'reading' | 'listening'): number => {
      if (list.length === 0) return 0;
      const norm = pick === 'reading' ? norms.readingPerWeek : norms.listeningPerWeek;
      return (
        Math.round((list.filter((s) => cell(s.id, w)[pick] >= norm).length / list.length) * 100) /
        100
      );
    };
    const rates = (list: Student[]): SchoolWeekRate[] =>
      starts.map((w) => ({
        week: w,
        label: weekLabel(w),
        reading: rate(list, w, 'reading'),
        listening: rate(list, w, 'listening'),
      }));
    const healthCounts = (list: Student[]): Record<Health, number> => {
      const h: Record<Health, number> = { good: 0, warn: 0, bad: 0 };
      for (const s of list) h[healthOf(s, now)] += 1;
      return h;
    };
    const groupsOf = (id: string): string =>
      (byStudent.get(id) ?? [])
        .map((chatId) => title.get(chatId))
        .filter((t): t is string => !!t)
        .join(', ');
    const byId = new Map(active.map((s) => [s.id, s]));

    const students: SchoolStudentFacts[] = active
      .map((s) => {
        const perWeek = starts.map((w): [number, number] => {
          const c = cell(s.id, w);
          return [c.reading, c.listening];
        });
        return {
          id: s.id,
          name: displayNameOf(s),
          groups: groupsOf(s.id),
          level: s.level ? LEVEL_LABELS[s.level] : null,
          health: healthOf(s, now),
          silentDays: silentDays(s, now),
          blockedBot: s.dmBlocked,
          weeks: perWeek,
          metReading: perWeek.filter(([r]) => r >= norms.readingPerWeek).length,
          metListening: perWeek.filter(([, l]) => l >= norms.listeningPerWeek).length,
          words: wordCounts.get(s.id) ?? { total: 0, learned: 0 },
          flagsNew: flagsNew.get(s.id) ?? 0,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'));

    return {
      scope: scope.groupIds === null && scope.studentIds === null ? 'school' : 'groups',
      period: {
        weeks: starts,
        labels: starts.map(weekLabel),
        currentWeek: current,
        weeksOf: weeks,
      },
      norms: { ...norms },
      totals: {
        students: active.length,
        health: healthCounts(active),
        flagsNew: [...flagsNew.values()].reduce((a, b) => a + b, 0),
        weeks: rates(active),
      },
      groups: groups.map((g) => {
        const members = active.filter((s) => (byStudent.get(s.id) ?? []).includes(g.chatId));
        return {
          chatId: g.chatId,
          title: g.title,
          level: g.level ? LEVEL_LABELS[g.level] : null,
          students: members.length,
          health: healthCounts(members),
          weeks: rates(members),
        };
      }),
      students,
      missedThisWeek: active
        .filter((s) => {
          const c = cell(s.id, current);
          return c.reading === 0 && c.listening === 0;
        })
        .map((s) => displayNameOf(s)),
      topReadersThisWeek: topRaw
        .map((r) => {
          const s = byId.get(r.studentId);
          return s ? { name: displayNameOf(s), pages: r.pages } : null;
        })
        .filter((x): x is { name: string; pages: number } => x !== null),
    };
  }
}
