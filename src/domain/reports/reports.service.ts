import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { format, fromZonedTime, toZonedTime } from 'date-fns-tz';
import { Between, In, LessThanOrEqual, Repository } from 'typeorm';
import { AppConfigService } from '../../config/config.service';
import { globalConfig } from '../../config/global.config';
import { Student } from '../students/student.entity';
import { DailyReport } from './daily-report.entity';

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(DailyReport)
    private readonly repo: Repository<DailyReport>,
    private readonly config: AppConfigService,
  ) {}

  /** Returns YYYY-MM-DD for "today" in the configured timezone. */
  todayDateString(now: Date = new Date()): string {
    const zoned = toZonedTime(now, this.config.timezone);
    return format(zoned, 'yyyy-MM-dd', { timeZone: this.config.timezone });
  }

  /** True if `now` (in the configured tz) falls on a class day (Mon–Fri by default). */
  isClassDay(now: Date = new Date()): boolean {
    const dow = toZonedTime(now, this.config.timezone).getDay();
    return globalConfig.schedule.classDays.includes(dow);
  }

  /** True if the given YYYY-MM-DD local date is a class day. */
  isClassDayString(date: string): boolean {
    const [y, m, d] = date.split('-').map(Number);
    // Weekday is timezone-independent for a plain calendar date.
    return globalConfig.schedule.classDays.includes(new Date(Date.UTC(y, m - 1, d)).getUTCDay());
  }

  /** Yesterday's date string in the configured timezone. */
  yesterdayDateString(now: Date = new Date()): string {
    return this.dateStringDaysAgo(1, now);
  }

  /** N days ago, in the configured timezone (>=0). */
  dateStringDaysAgo(daysAgo: number, now: Date = new Date()): string {
    const zoned = toZonedTime(now, this.config.timezone);
    zoned.setDate(zoned.getDate() - daysAgo);
    return format(zoned, 'yyyy-MM-dd', { timeZone: this.config.timezone });
  }

  findByStudentAndDate(studentId: string, date: string): Promise<DailyReport | null> {
    return this.repo.findOne({ where: { studentId, date } });
  }

  /** Returns the row for (student, today), creating it if missing. */
  async getOrCreateToday(studentId: string): Promise<DailyReport> {
    const date = this.todayDateString();
    return this.getOrCreateForDate(studentId, date);
  }

  private async getOrCreateForDate(studentId: string, date: string): Promise<DailyReport> {
    const existing = await this.repo.findOne({ where: { studentId, date } });
    if (existing) return existing;
    const created = this.repo.create({
      studentId,
      date,
      wordsCount: 0,
      pageReached: null,
      pagesReadToday: null,
      submittedWords: false,
      submittedPage: false,
    });
    return this.repo.save(created);
  }

  async recordWords(studentId: string, count: number): Promise<DailyReport> {
    const row = await this.getOrCreateToday(studentId);
    row.wordsCount += count;
    row.submittedWords = true;
    return this.repo.save(row);
  }

  /** Record the student's listening/reading answers for today (v2 evening flow). */
  async recordExercises(
    studentId: string,
    didListening: boolean,
    didReading: boolean,
  ): Promise<DailyReport> {
    const row = await this.getOrCreateToday(studentId);
    row.didListening = didListening;
    row.didReading = didReading;
    return this.repo.save(row);
  }

  /** Record just the listening answer for today. */
  async recordListening(studentId: string, did: boolean): Promise<DailyReport> {
    const row = await this.getOrCreateToday(studentId);
    row.didListening = did;
    return this.repo.save(row);
  }

  /** Record just the reading answer for today. */
  async recordReading(studentId: string, did: boolean): Promise<DailyReport> {
    const row = await this.getOrCreateToday(studentId);
    row.didReading = did;
    return this.repo.save(row);
  }

  /** Flag that today's word submission arrived as a forward / via inline bot (anti-AI hard signal). */
  async markWordsForwarded(studentId: string): Promise<void> {
    const row = await this.getOrCreateToday(studentId);
    row.wordsForwarded = true;
    await this.repo.save(row);
  }

  /** Accumulate one morning self-check result (typed reverse-recall of the student's own word). */
  async recordFirstCheck(studentId: string, correct: boolean): Promise<void> {
    const row = await this.getOrCreateToday(studentId);
    row.firstCheckTotal = (row.firstCheckTotal ?? 0) + 1;
    row.firstCheckCorrect = (row.firstCheckCorrect ?? 0) + (correct ? 1 : 0);
    await this.repo.save(row);
  }

  async recordPage(
    studentId: string,
    pageReached: number,
    previousPage: number,
  ): Promise<DailyReport> {
    const row = await this.getOrCreateToday(studentId);
    row.pageReached = pageReached;
    row.pagesReadToday = pageReached - previousPage;
    row.submittedPage = true;
    return this.repo.save(row);
  }

  /**
   * Count one answered flashcard against today's row. Does NOT mark the day as
   * active (reviewing is separate from submitting reading) — it only feeds the
   * "повторено N" figure in the report.
   */
  async recordReview(studentId: string, count = 1): Promise<DailyReport> {
    const row = await this.getOrCreateToday(studentId);
    row.reviewedCount += count;
    return this.repo.save(row);
  }

  /**
   * Ensures each given student has a daily_reports row for yesterday.
   * Used by the 00:05 finalization cron. Idempotent (UNIQUE constraint).
   */
  async ensureYesterdayRowsExist(students: Pick<Student, 'id'>[]): Promise<number> {
    if (students.length === 0) return 0;
    const date = this.yesterdayDateString();
    let created = 0;
    for (const s of students) {
      const existing = await this.repo.findOne({ where: { studentId: s.id, date } });
      if (existing) continue;
      const row = this.repo.create({
        studentId: s.id,
        date,
        wordsCount: 0,
        pageReached: null,
        pagesReadToday: null,
        submittedWords: false,
        submittedPage: false,
      });
      await this.repo.save(row);
      created += 1;
    }
    return created;
  }

  /**
   * Streak: rows must exist for yesterday, day-2, day-3, AND all have countsAsActive=false.
   * Gaps (missing rows) break the streak — we don't penalise bot downtime.
   */
  async isInactiveFor3DaysEndingYesterday(studentId: string): Promise<boolean> {
    const dates = [
      this.dateStringDaysAgo(1),
      this.dateStringDaysAgo(2),
      this.dateStringDaysAgo(3),
    ];
    const rows = await this.repo.find({ where: { studentId, date: In(dates) } });
    if (rows.length < 3) return false;
    return rows.every((r) => !r.countsAsActive);
  }

  /**
   * Walks backwards from `endDate` (inclusive) counting consecutive inactive
   * days. Stops at first active day or first missing row.
   */
  async countConsecutiveInactiveEndingOn(studentId: string, endDate: string): Promise<number> {
    const rows = await this.repo.find({
      where: { studentId },
      order: { date: 'DESC' },
      take: 30, // safety cap; consecutive streaks beyond this are unrealistic for class context
    });
    let streak = 0;
    let expected = endDate;
    for (const r of rows) {
      if (r.date > endDate) continue;
      if (r.date !== expected) break; // gap
      if (r.countsAsActive) break;
      streak += 1;
      expected = this.shiftDateString(expected, -1);
    }
    return streak;
  }

  findForDateAndStudents(date: string, studentIds: string[]): Promise<DailyReport[]> {
    if (studentIds.length === 0) return Promise.resolve([]);
    return this.repo.find({ where: { date, studentId: In(studentIds) } });
  }

  /** Daily rows for the given students within [startDate, endDate] (inclusive, YYYY-MM-DD). */
  findBetweenDatesForStudents(
    startDate: string,
    endDate: string,
    studentIds: string[],
  ): Promise<DailyReport[]> {
    if (studentIds.length === 0) return Promise.resolve([]);
    return this.repo.find({
      where: { studentId: In(studentIds), date: Between(startDate, endDate) },
      order: { date: 'ASC' },
    });
  }

  /** Shift a YYYY-MM-DD date string by N days (calendar arithmetic, tz-independent). */
  shiftDate(date: string, days: number): string {
    return this.shiftDateString(date, days);
  }

  /**
   * Resolve the class-week window (Mon–Fri).
   * - 'lastComplete': the most recent finished class week (used by the Saturday
   *   cron and `/report last`).
   * - 'toDate': the current class week from Monday up to today (used by `/report`).
   */
  weekBounds(
    now: Date = new Date(),
    mode: 'lastComplete' | 'toDate' = 'lastComplete',
  ): { monday: string; friday: string; dates: string[] } {
    const today = this.todayDateString(now);
    const dow = this.dowOf(today); // 0=Sun … 6=Sat

    if (mode === 'toDate') {
      const daysSinceMonday = (dow + 6) % 7; // Mon→0 … Sun→6
      const monday = this.shiftDateString(today, -daysSinceMonday);
      const friday = this.shiftDateString(monday, 4);
      const lastDay = today <= friday ? today : friday;
      return { monday, friday: lastDay, dates: this.classDaysBetween(monday, lastDay) };
    }

    // lastComplete: Friday of the last finished class week.
    let friday: string;
    if (dow === 6) friday = this.shiftDateString(today, -1); // Sat → this Fri
    else if (dow === 0) friday = this.shiftDateString(today, -2); // Sun → this Fri
    else friday = this.shiftDateString(today, -dow - 2); // Mon–Fri → previous Fri
    const monday = this.shiftDateString(friday, -4);
    return { monday, friday, dates: this.classDaysBetween(monday, friday) };
  }

  /**
   * A rolling window of the last `days` calendar days ending today (inclusive of
   * every day, weekends included). Used by the demo tools so live-entered data
   * shows regardless of weekday.
   */
  rollingBounds(now: Date = new Date(), days = 7): { monday: string; friday: string; dates: string[] } {
    const today = this.todayDateString(now);
    const start = this.shiftDateString(today, -(Math.max(1, days) - 1));
    const dates: string[] = [];
    let cursor = start;
    let guard = 0;
    while (cursor <= today && guard++ < 400) {
      dates.push(cursor);
      cursor = this.shiftDateString(cursor, 1);
    }
    return { monday: start, friday: today, dates };
  }

  /** Class-day (Mon–Fri) date strings within [start, end] inclusive. */
  classDaysBetween(start: string, end: string): string[] {
    const out: string[] = [];
    let cursor = start;
    let guard = 0;
    while (cursor <= end && guard++ < 366) {
      if (this.isClassDayString(cursor)) out.push(cursor);
      cursor = this.shiftDateString(cursor, 1);
    }
    return out;
  }

  /**
   * Count consecutive inactive class days ending at `endDate` (inclusive),
   * skipping weekends. Stops at the first active class day or first missing row.
   */
  async countConsecutiveInactiveClassDays(studentId: string, endDate: string): Promise<number> {
    const rows = await this.repo.find({
      where: { studentId, date: LessThanOrEqual(endDate) },
      order: { date: 'DESC' },
      take: 40,
    });
    const byDate = new Map<string, DailyReport>(rows.map((r) => [r.date, r]));
    let streak = 0;
    let cursor = endDate;
    let guard = 0;
    while (guard++ < 60) {
      if (this.isClassDayString(cursor)) {
        const r = byDate.get(cursor);
        if (!r || r.countsAsActive) break;
        streak += 1;
      }
      cursor = this.shiftDateString(cursor, -1);
    }
    return streak;
  }

  private dowOf(date: string): number {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  }

  /**
   * Returns the UTC bounds [startUTC, endUTC) for a local YYYY-MM-DD day in the
   * configured timezone. Used to query timestamptz columns by "local day".
   */
  localDayBoundsUTC(date: string): { start: Date; end: Date } {
    const tz = this.config.timezone;
    const start = fromZonedTime(`${date}T00:00:00`, tz);
    const end = fromZonedTime(`${date}T00:00:00`, tz);
    end.setUTCDate(end.getUTCDate() + 1);
    return { start, end };
  }

  private shiftDateString(date: string, days: number): string {
    const [y, m, d] = date.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + days);
    const yy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(dt.getUTCDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
  }
}
