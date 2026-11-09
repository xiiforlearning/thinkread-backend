import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, Not, Repository } from 'typeorm';
import { addDays, format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { ErrorCode, ErrorLevel, ServiceCode } from '../../common/codes';
import { AppError } from '../../common/errors';
import { globalConfig } from '../../config/global.config';
import { listeningMethodFor } from '../groups/level';
import { localDay, SlotView, slotOf, slotViews, weekStart } from '../norms/week';
import { Student } from '../students/student.entity';
import { ListeningReportInput } from './listening-fields';
import { ReportMetrics } from '../flags/flag.enums';
import { Report, ReportType } from './report.entity';

function weekKeyOf(d: string | Date): string {
  return d instanceof Date ? format(d, 'yyyy-MM-dd') : String(d).slice(0, 10);
}

export interface ReadingReportInput {
  bookTitle: string;
  pages: number | null;
  summary: string;
  newWords: string[];
}

/** Where the report came from: the message it was parsed from. */
export interface ReportOrigin {
  now: Date;
  timeZone: string;
  rawText: string;
  forwarded: boolean;
  /** Confirmed by the student with an empty word list. */
  noNewWords?: boolean;
}

export interface WeekProgress {
  weekStart: string;
  /** Windows of the week with at least one report of the type (N1), not raw report counts. */
  reading: number;
  listening: number;
  readingNorm: number;
  listeningNorm: number;
  /** The three windows of each type as the student sees them now. */
  slots?: { reading: SlotView[]; listening: SlotView[] };
}

/**
 * Reports are the unit of the weekly norm. Parsing is the AI's job (through
 * the tools); this service only validates ranges and stores the result.
 */
@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Report)
    private readonly repo: Repository<Report>,
  ) {}

  findById(id: string): Promise<Report | null> {
    return this.repo.findOne({ where: { id } });
  }

  async saveReading(
    student: Student,
    input: ReadingReportInput,
    origin: ReportOrigin,
  ): Promise<Report> {
    if (input.pages !== null && (!Number.isInteger(input.pages) || input.pages <= 0)) {
      throw this.invalid('pages', input.pages);
    }
    return this.repo.save(
      this.repo.create({
        studentId: student.id,
        type: ReportType.READING,
        method: null,
        rawText: origin.rawText,
        sourceTitle: input.bookTitle.trim(),
        episode: null,
        pages: input.pages,
        summary: input.summary.trim(),
        firstPassPct: null,
        secondPassPct: null,
        listenCount: null,
        unclearParts: [],
        parsed: { newWords: input.newWords },
        wordsAdded: 0,
        noNewWords: origin.noNewWords ?? false,
        weekStart: weekStart(origin.now, origin.timeZone),
        slot: slotOf(origin.now, origin.timeZone),
        isForwarded: origin.forwarded,
      }),
    );
  }

  /** Callers check `missingListeningFields` first; this only guards ranges. */
  async saveListening(
    student: Student,
    input: ListeningReportInput,
    origin: ReportOrigin,
  ): Promise<Report> {
    for (const [name, value] of [
      ['first_pass_pct', input.firstPassPct],
      ['second_pass_pct', input.secondPassPct],
    ] as const) {
      if (value !== null && (!Number.isInteger(value) || value < 0 || value > 100)) {
        throw this.invalid(name, value);
      }
    }
    if (
      input.listenCount !== null &&
      (!Number.isInteger(input.listenCount) || input.listenCount <= 0)
    ) {
      throw this.invalid('listen_count', input.listenCount);
    }
    return this.repo.save(
      this.repo.create({
        studentId: student.id,
        type: ReportType.LISTENING,
        method: listeningMethodFor(student.level),
        rawText: origin.rawText,
        sourceTitle: (input.sourceTitle ?? '').trim() || null,
        episode: (input.episode ?? '').trim() || null,
        pages: null,
        summary: (input.retelling ?? '').trim() || null,
        firstPassPct: input.firstPassPct,
        secondPassPct: input.secondPassPct,
        listenCount: input.listenCount,
        unclearParts: input.unclearParts,
        parsed: { newWords: input.newWords },
        wordsAdded: 0,
        noNewWords: origin.noNewWords ?? false,
        weekStart: weekStart(origin.now, origin.timeZone),
        slot: slotOf(origin.now, origin.timeZone),
        isForwarded: origin.forwarded,
      }),
    );
  }

  /**
   * The local week containing `now`: which windows of each type are filled (N1 — a second report
   * in the same window counts once), against the owner's weekly norm.
   */
  async weekProgress(studentId: string, now: Date, timeZone: string): Promise<WeekProgress> {
    const start = weekStart(now, timeZone);
    const filled = await this.filledSlots(studentId, start);
    return {
      weekStart: start,
      reading: filled.reading.size,
      listening: filled.listening.size,
      readingNorm: globalConfig.norms.readingPerWeek,
      listeningNorm: globalConfig.norms.listeningPerWeek,
      slots: {
        reading: slotViews(start, filled.reading, now, timeZone),
        listening: slotViews(start, filled.listening, now, timeZone),
      },
    };
  }

  /** Windows of one week that already hold a report, per type. */
  async filledSlots(
    studentId: string,
    start: string,
  ): Promise<{ reading: Set<number>; listening: Set<number> }> {
    const rows = await this.repo
      .createQueryBuilder('r')
      .select('r.type', 'type')
      .addSelect('r.slot', 'slot')
      .where('r.student_id = :studentId', { studentId })
      .andWhere('r.week_start = :start', { start })
      .andWhere('r.slot IS NOT NULL')
      .groupBy('r.type')
      .addGroupBy('r.slot')
      .getRawMany<{ type: ReportType; slot: number }>();
    const out = { reading: new Set<number>(), listening: new Set<number>() };
    for (const row of rows)
      (row.type === ReportType.READING ? out.reading : out.listening).add(Number(row.slot));
    return out;
  }

  async setWordsAdded(reportId: string, wordsAdded: number): Promise<void> {
    await this.repo.update({ id: reportId }, { wordsAdded });
  }

  async setAiMetrics(reportId: string, aiMetrics: ReportMetrics): Promise<void> {
    await this.repo.update({ id: reportId }, { aiMetrics });
  }

  /**
   * Reports of one type handed in on the local day containing `now`. The daily
   * cap (`norms.maxReportsPerTypePerDay`) keeps a week's norm from being closed
   * in one evening and bounds the AI spend per student.
   */
  async countToday(
    studentId: string,
    type: ReportType,
    now: Date,
    timeZone: string,
  ): Promise<number> {
    const day = localDay(now, timeZone);
    const row = await this.repo
      .createQueryBuilder('r')
      .select('COUNT(*)', 'count')
      .where('r.student_id = :studentId', { studentId })
      .andWhere('r.type = :type', { type })
      .andWhere("to_char(r.created_at AT TIME ZONE :tz, 'YYYY-MM-DD') = :day", {
        tz: timeZone,
        day,
      })
      .getRawOne<{ count: string }>();
    return Number(row?.count ?? 0);
  }

  async dailyLimitReached(
    studentId: string,
    type: ReportType,
    now: Date,
    timeZone: string,
  ): Promise<boolean> {
    const today = await this.countToday(studentId, type, now, timeZone);
    return today >= globalConfig.norms.maxReportsPerTypePerDay;
  }

  /**
   * Per-student, per-week report counts for the given Mondays — one query
   * for the whole dashboard. Map key: `${studentId}|${weekStart}`.
   */
  async countsByWeek(
    studentIds: string[],
    weekStarts: string[],
  ): Promise<Map<string, { reading: number; listening: number }>> {
    const out = new Map<string, { reading: number; listening: number }>();
    if (studentIds.length === 0 || weekStarts.length === 0) return out;
    const rows = await this.repo
      .createQueryBuilder('r')
      .select('r.student_id', 'studentId')
      .addSelect('r.week_start', 'weekStart')
      .addSelect('r.type', 'type')
      // Windows filled, not reports handed in (N1): two reports in one window count once.
      .addSelect('COUNT(DISTINCT COALESCE(r.slot, 0))', 'count')
      .where('r.student_id IN (:...studentIds)', { studentIds })
      .andWhere('r.week_start IN (:...weekStarts)', { weekStarts })
      .groupBy('r.student_id')
      .addGroupBy('r.week_start')
      .addGroupBy('r.type')
      .getRawMany<{
        studentId: string;
        weekStart: string | Date;
        type: ReportType;
        count: string;
      }>();
    for (const row of rows) {
      const key = `${row.studentId}|${weekKeyOf(row.weekStart)}`;
      const cell = out.get(key) ?? { reading: 0, listening: 0 };
      if (row.type === ReportType.READING) cell.reading += Number(row.count);
      else cell.listening += Number(row.count);
      out.set(key, cell);
    }
    return out;
  }

  /**
   * Reports handed in and pages read per student and week — raw counts (not windows) for the
   * overview tiles and the Top 3 ranking. Map key: `${studentId}|${weekStart}`.
   */
  async totalsByWeek(
    studentIds: string[],
    weekStarts: string[],
  ): Promise<Map<string, { reading: number; listening: number; pages: number }>> {
    const out = new Map<string, { reading: number; listening: number; pages: number }>();
    if (studentIds.length === 0 || weekStarts.length === 0) return out;
    const rows = await this.repo
      .createQueryBuilder('r')
      .select('r.student_id', 'studentId')
      .addSelect('r.week_start', 'weekStart')
      .addSelect('r.type', 'type')
      .addSelect('COUNT(*)', 'count')
      .addSelect('COALESCE(SUM(r.pages), 0)', 'pages')
      .where('r.student_id IN (:...studentIds)', { studentIds })
      .andWhere('r.week_start IN (:...weekStarts)', { weekStarts })
      .groupBy('r.student_id')
      .addGroupBy('r.week_start')
      .addGroupBy('r.type')
      .getRawMany<{
        studentId: string;
        weekStart: string | Date;
        type: ReportType;
        count: string;
        pages: string;
      }>();
    for (const row of rows) {
      const key = `${row.studentId}|${weekKeyOf(row.weekStart)}`;
      const cell = out.get(key) ?? { reading: 0, listening: 0, pages: 0 };
      if (row.type === ReportType.READING) {
        cell.reading += Number(row.count);
        cell.pages += Number(row.pages);
      } else cell.listening += Number(row.count);
      out.set(key, cell);
    }
    return out;
  }

  /** The newest reports across students, for the overview feed. */
  latest(studentIds: string[], limit = 20): Promise<Report[]> {
    if (studentIds.length === 0) return Promise.resolve([]);
    return this.repo.find({
      where: { studentId: In(studentIds) },
      order: { createdAt: 'DESC' },
      take: Math.min(limit, 100),
    });
  }

  /** Pages read per student in one week, most first; `exclude` = students with confirmed flags. */
  async topReaders(
    studentIds: string[],
    weekStart: string,
    limit = 3,
    exclude: Set<string> = new Set(),
  ): Promise<Array<{ studentId: string; pages: number; reports: number }>> {
    const eligible = studentIds.filter((id) => !exclude.has(id));
    if (eligible.length === 0) return [];
    const rows = await this.repo
      .createQueryBuilder('r')
      .select('r.student_id', 'studentId')
      .addSelect('COALESCE(SUM(r.pages), 0)', 'pages')
      .addSelect('COUNT(*)', 'reports')
      .where('r.student_id IN (:...studentIds)', { studentIds: eligible })
      .andWhere('r.week_start = :weekStart', { weekStart })
      .andWhere('r.type = :type', { type: ReportType.READING })
      .groupBy('r.student_id')
      .orderBy('pages', 'DESC')
      .limit(limit)
      .getRawMany<{ studentId: string; pages: string; reports: string }>();
    return rows.map((r) => ({
      studentId: r.studentId,
      pages: Number(r.pages),
      reports: Number(r.reports),
    }));
  }

  /** Newest first, cursor = createdAt of the last item of the previous page. */
  async history(studentId: string, limit = 20, before?: Date): Promise<Report[]> {
    return this.repo.find({
      where: before ? { studentId, createdAt: LessThan(before) } : { studentId },
      order: { createdAt: 'DESC' },
      take: Math.min(limit, 100),
    });
  }

  /** Per-week counts for the last `weeks` weeks (newest first), for the calendar. */
  async calendar(
    studentId: string,
    weeks: number,
    now: Date,
    timeZone: string,
  ): Promise<WeekProgress[]> {
    const current = weekStart(now, timeZone);
    const starts: string[] = [];
    let cursor = toZonedTime(new Date(`${current}T12:00:00Z`), 'UTC');
    for (let i = 0; i < weeks; i += 1) {
      starts.push(format(cursor, 'yyyy-MM-dd'));
      cursor = addDays(cursor, -7);
    }
    const rows = await this.repo
      .createQueryBuilder('r')
      .select('r.week_start', 'weekStart')
      .addSelect('r.type', 'type')
      .addSelect('COUNT(DISTINCT COALESCE(r.slot, 0))', 'count')
      .where('r.student_id = :studentId', { studentId })
      .andWhere('r.week_start IN (:...starts)', { starts })
      .groupBy('r.week_start')
      .addGroupBy('r.type')
      .getRawMany<{ weekStart: string | Date; type: ReportType; count: string }>();
    const key = (d: string | Date): string =>
      d instanceof Date ? format(d, 'yyyy-MM-dd') : String(d).slice(0, 10);
    return starts.map((start) => ({
      weekStart: start,
      reading: Number(
        rows.find((r) => key(r.weekStart) === start && r.type === ReportType.READING)?.count ?? 0,
      ),
      listening: Number(
        rows.find((r) => key(r.weekStart) === start && r.type === ReportType.LISTENING)?.count ?? 0,
      ),
      readingNorm: globalConfig.norms.readingPerWeek,
      listeningNorm: globalConfig.norms.listeningPerWeek,
    }));
  }

  /** The student corrects parsed fields on the result screen (within a day). */
  async updateFields(
    report: Report,
    patch: Partial<
      Pick<
        Report,
        | 'sourceTitle'
        | 'episode'
        | 'pages'
        | 'summary'
        | 'firstPassPct'
        | 'secondPassPct'
        | 'listenCount'
      >
    >,
  ): Promise<Report> {
    if (Date.now() - report.createdAt.getTime() > 24 * 3_600_000) {
      throw new AppError({
        level: ErrorLevel.LOW_BUSINESS,
        service: ServiceCode.REPORTS,
        error: ErrorCode.INVALID_STATE,
        message: 'report is older than a day',
      });
    }
    Object.assign(report, patch);
    return this.repo.save(report);
  }

  /** Latest reports of one type, newest first — context for the authenticity check. */
  recent(
    studentId: string,
    type: ReportType,
    limit: number,
    excludeId?: string,
  ): Promise<Report[]> {
    return this.repo.find({
      where: excludeId ? { studentId, type, id: Not(excludeId) } : { studentId, type },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  private invalid(field: string, value: unknown): AppError {
    return new AppError({
      level: ErrorLevel.LOW_BUSINESS,
      service: ServiceCode.REPORTS,
      error: ErrorCode.VALIDATION,
      message: `${field} out of range`,
      meta: { field, value },
    });
  }
}
