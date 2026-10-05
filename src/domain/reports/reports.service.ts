import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Not, Repository } from 'typeorm';
import { addDays, format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { ErrorCode, ErrorLevel, ServiceCode } from '../../common/codes';
import { AppError } from '../../common/errors';
import { globalConfig } from '../../config/global.config';
import { listeningMethodFor } from '../groups/level';
import { localDay, weekStart } from '../norms/week';
import { Student } from '../students/student.entity';
import { ListeningReportInput } from './listening-fields';
import { Report, ReportType } from './report.entity';

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
}

export interface WeekProgress {
  weekStart: string;
  reading: number;
  listening: number;
  readingNorm: number;
  listeningNorm: number;
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
        weekStart: weekStart(origin.now, origin.timeZone),
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
        weekStart: weekStart(origin.now, origin.timeZone),
        isForwarded: origin.forwarded,
      }),
    );
  }

  /** Reports of the local week containing `now`, by type, against the norms. */
  async weekProgress(studentId: string, now: Date, timeZone: string): Promise<WeekProgress> {
    const start = weekStart(now, timeZone);
    const rows = await this.repo
      .createQueryBuilder('r')
      .select('r.type', 'type')
      .addSelect('COUNT(*)', 'count')
      .where('r.student_id = :studentId', { studentId })
      .andWhere('r.week_start = :start', { start })
      .groupBy('r.type')
      .getRawMany<{ type: ReportType; count: string }>();
    const count = (type: ReportType): number =>
      Number(rows.find((r) => r.type === type)?.count ?? 0);
    return {
      weekStart: start,
      reading: count(ReportType.READING),
      listening: count(ReportType.LISTENING),
      readingNorm: globalConfig.norms.readingPerWeek,
      listeningNorm: globalConfig.norms.listeningPerWeek,
    };
  }

  async setWordsAdded(reportId: string, wordsAdded: number): Promise<void> {
    await this.repo.update({ id: reportId }, { wordsAdded });
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
      .addSelect('COUNT(*)', 'count')
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
