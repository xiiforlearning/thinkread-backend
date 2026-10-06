import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../../config/config.service';
import { globalConfig } from '../../config/global.config';
import { FlagsService } from '../flags/flags.service';
import { GroupsService } from '../groups/groups.service';
import { recentWeekStarts } from '../norms/week';
import { Report, ReportType } from '../reports/report.entity';
import { ReportsService } from '../reports/reports.service';
import { healthOf, silentDays } from '../students/health';
import { displayNameOf } from '../students/name-validation';
import { Student } from '../students/student.entity';
import { StudentsService } from '../students/students.service';
import { WordStatus } from '../words/word.enums';
import { WordsService } from '../words/words.service';

/** Everything the teacher-facing AI may say about a student — computed by the system, never by the model. */
export interface StudentFacts {
  student: {
    name: string;
    firstName: string | null;
    level: string | null;
    groups: string[];
    registeredAt: string;
    lastActivityAt: string | null;
    silentDays: number;
    health: string;
    calmMode: boolean;
    dmBlocked: boolean;
  };
  norms: { readingPerWeek: number; listeningPerWeek: number; cardsPerDay: number };
  period: { from: string; to: string; label: string };
  weeks: Array<{ weekStart: string; reading: number; listening: number }>;
  weeksMet: { reading: number; listening: number; of: number };
  reports: Array<{
    date: string;
    type: 'READING' | 'LISTENING';
    source: string | null;
    pages: number | null;
    firstPassPct: number | null;
    secondPassPct: number | null;
    listenCount: number | null;
    summary: string | null;
    wordsAdded: number;
  }>;
  totals: { reports: number; reading: number; listening: number; pages: number; sources: string[] };
  vocabulary: {
    total: number;
    learning: number;
    learned: number;
    priority: number;
    byCefr: Record<string, number>;
    addedInPeriod: number;
    learnedInPeriod: number;
  };
  stuckWords: Array<{
    word: string;
    translation: string | null;
    stage: number;
    correctTotal: number;
    daysInLearning: number;
  }>;
  recentWords: string[];
  flags: Array<{ kind: string; status: string; date: string; reason: string | null }>;
}

const DAY_MS = 86_400_000;

@Injectable()
export class StudentFactsService {
  constructor(
    private readonly students: StudentsService,
    private readonly groups: GroupsService,
    private readonly reports: ReportsService,
    private readonly words: WordsService,
    private readonly flags: FlagsService,
    private readonly config: AppConfigService,
  ) {}

  /** Facts for the last `weeks` weeks (teacher chat) or an explicit `[from, to)` range (parents' report). */
  async collect(
    student: Student,
    now: Date,
    range: { weeks: number } | { from: Date; to: Date; label: string },
  ): Promise<StudentFacts> {
    const tz = this.config.timezone;
    const weekStarts =
      'weeks' in range
        ? recentWeekStarts(now, tz, range.weeks)
        : recentWeekStarts(new Date(range.to.getTime() - 1), tz, 6).filter(
            (w) => new Date(`${w}T12:00:00Z`) >= new Date(range.from.getTime() - 4 * DAY_MS),
          );
    const from =
      'weeks' in range ? new Date(`${weekStarts[weekStarts.length - 1]}T00:00:00Z`) : range.from;
    const to = 'weeks' in range ? now : range.to;
    const [groupIds, allGroups, counts, history, summary, learning, learned, flags] =
      await Promise.all([
        this.students.memberGroupIds(student.id),
        this.groups.findAllActive(),
        this.reports.countsByWeek([student.id], weekStarts),
        this.reports.history(student.id, 100),
        this.words.summary(student.id),
        this.words.search(student.id, { status: WordStatus.LEARNING, limit: 100 }),
        this.words.search(student.id, { status: WordStatus.LEARNED, limit: 100 }),
        this.flags.list({ studentId: student.id, limit: 20 }),
      ]);
    const norms = globalConfig.norms;
    const weeks = weekStarts.map((weekStart) => ({
      weekStart,
      ...(counts.get(`${student.id}|${weekStart}`) ?? { reading: 0, listening: 0 }),
    }));
    const inRange = history.filter((r) => r.createdAt >= from && r.createdAt < to);
    const reports = inRange.map((r) => this.reportFacts(r));
    const sources = [...new Set(inRange.map((r) => r.sourceTitle).filter((s): s is string => !!s))];
    const titles = new Map(allGroups.map((g) => [g.chatId, g.title]));
    const calmUntil = student.dialogState?.tiredUntil;
    return {
      student: {
        name: displayNameOf(student),
        firstName: student.firstName,
        level: student.level,
        groups: groupIds.map((id) => titles.get(id)).filter((t): t is string => !!t),
        registeredAt: student.registeredAt.toISOString().slice(0, 10),
        lastActivityAt: student.lastActivityAt?.toISOString().slice(0, 10) ?? null,
        silentDays: silentDays(student, now),
        health: healthOf(student, now),
        calmMode: !!calmUntil && new Date(calmUntil) > now,
        dmBlocked: student.dmBlocked,
      },
      norms: {
        readingPerWeek: norms.readingPerWeek,
        listeningPerWeek: norms.listeningPerWeek,
        cardsPerDay: norms.cardsPerDay,
      },
      period: {
        from: from.toISOString().slice(0, 10),
        to: to.toISOString().slice(0, 10),
        label: 'weeks' in range ? `последние ${range.weeks} нед.` : range.label,
      },
      weeks,
      weeksMet: {
        reading: weeks.filter((w) => w.reading >= norms.readingPerWeek).length,
        listening: weeks.filter((w) => w.listening >= norms.listeningPerWeek).length,
        of: weeks.length,
      },
      reports,
      totals: {
        reports: inRange.length,
        reading: inRange.filter((r) => r.type === ReportType.READING).length,
        listening: inRange.filter((r) => r.type === ReportType.LISTENING).length,
        pages: inRange.reduce((n, r) => n + (r.pages ?? 0), 0),
        sources,
      },
      vocabulary: {
        total: summary.total,
        learning: summary.learning,
        learned: summary.learned,
        priority: summary.priority,
        byCefr: summary.byCefr,
        addedInPeriod: [...learning, ...learned].filter(
          (w) => w.createdAt >= from && w.createdAt < to,
        ).length,
        learnedInPeriod: learned.filter(
          (w) => w.learnedAt && w.learnedAt >= from && w.learnedAt < to,
        ).length,
      },
      stuckWords: learning
        .map((w) => ({
          word: w.word,
          translation: w.translation,
          stage: w.stage,
          correctTotal: w.correctTotal,
          daysInLearning: Math.floor((now.getTime() - w.createdAt.getTime()) / DAY_MS),
        }))
        .filter((w) => w.daysInLearning >= 14)
        .sort((a, b) => a.stage - b.stage || b.daysInLearning - a.daysInLearning)
        .slice(0, 5),
      recentWords: learning.slice(0, 8).map((w) => w.word),
      flags: flags.map((f) => ({
        kind: f.kind,
        status: f.status,
        date: f.createdAt.toISOString().slice(0, 10),
        reason: f.reason,
      })),
    };
  }

  private reportFacts(r: Report): StudentFacts['reports'][number] {
    return {
      date: r.createdAt.toISOString().slice(0, 10),
      type: r.type,
      source: r.sourceTitle,
      pages: r.pages,
      firstPassPct: r.firstPassPct,
      secondPassPct: r.secondPassPct,
      listenCount: r.listenCount,
      summary: r.summary ? r.summary.slice(0, 240) : null,
      wordsAdded: r.wordsAdded ?? 0,
    };
  }
}
