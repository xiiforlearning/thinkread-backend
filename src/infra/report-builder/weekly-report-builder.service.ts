import { Injectable } from '@nestjs/common';
import { globalConfig } from '../../config/global.config';
import { Group } from '../../domain/groups/group.entity';
import { GroupsService } from '../../domain/groups/groups.service';
import { DailyReport } from '../../domain/reports/daily-report.entity';
import { ReportsService } from '../../domain/reports/reports.service';
import {
  formatWeeklyReport,
  WeeklyReportGroup,
  WeeklyStudentRow,
} from '../../domain/reports/weekly-report-formatter';
import { Student } from '../../domain/students/student.entity';
import { StudentsService } from '../../domain/students/students.service';
import { WordsService } from '../../domain/words/words.service';

export type WeekMode = 'lastComplete' | 'toDate';

export interface ReportWindow {
  monday: string;
  friday: string;
  dates: string[];
}

/** True if the week's rows show an advisory AI-suspicion signal. */
function computeAiFlag(reports: DailyReport[]): boolean {
  const forwarded = reports.some((r) => r.wordsForwarded);
  const total = reports.reduce((a, r) => a + (r.firstCheckTotal ?? 0), 0);
  const correct = reports.reduce((a, r) => a + (r.firstCheckCorrect ?? 0), 0);
  const { minSampleWords, suspectRate } = globalConfig.reports.recall;
  const lowRecall = total >= minSampleWords && correct / total < suspectRate;
  return forwarded || lowRecall;
}

@Injectable()
export class WeeklyReportBuilderService {
  constructor(
    private readonly groups: GroupsService,
    private readonly students: StudentsService,
    private readonly reports: ReportsService,
    private readonly words: WordsService,
  ) {}

  /** Chunked weekly report across all active groups (super-admin). */
  async buildForAllActive(mode: WeekMode = 'lastComplete'): Promise<string[]> {
    return this.build(await this.groups.findAllActive(), this.reports.weekBounds(new Date(), mode));
  }

  /** Chunked report across all active groups over an explicit window (demo tools). */
  async buildForAllActiveWindow(window: ReportWindow): Promise<string[]> {
    return this.build(await this.groups.findAllActive(), window);
  }

  /** Chunked weekly report for a single group chat. */
  async buildForGroupChat(chatId: number, mode: WeekMode = 'lastComplete'): Promise<string[]> {
    const group = await this.groups.findById(chatId);
    return this.build(group && group.isActive ? [group] : [], this.reports.weekBounds(new Date(), mode));
  }

  /** Chunked report for a single group chat over an explicit window (demo tools). */
  async buildForGroupChatWindow(chatId: number, window: ReportWindow): Promise<string[]> {
    const group = await this.groups.findById(chatId);
    return this.build(group && group.isActive ? [group] : [], window);
  }

  /** Chunked weekly report across the groups where the user is a teacher. */
  async buildForTeacher(telegramUserId: number, mode: WeekMode = 'lastComplete'): Promise<string[]> {
    return this.build(await this.groups.findActiveByTeacher(telegramUserId), this.reports.weekBounds(new Date(), mode));
  }

  private async build(groups: Group[], window: ReportWindow): Promise<string[]> {
    const { monday, friday, dates } = window;
    const reportGroups: WeeklyReportGroup[] = [];
    for (const group of groups) {
      const students = await this.students.findByChat(group.chatId);
      const rows = await this.buildRows(students, dates, monday, friday);
      reportGroups.push({ chatId: group.chatId, title: group.title, dates, students: rows });
    }
    return formatWeeklyReport({ monday, friday, groups: reportGroups });
  }

  private async buildRows(
    students: Student[],
    dates: string[],
    monday: string,
    friday: string,
  ): Promise<WeeklyStudentRow[]> {
    if (students.length === 0) return [];
    const ids = students.map((s) => s.id);

    const rows = await this.reports.findBetweenDatesForStudents(monday, friday, ids);
    const byKey = new Map<string, DailyReport>();
    const byStudent = new Map<string, DailyReport[]>();
    for (const r of rows) {
      byKey.set(`${r.studentId}|${r.date}`, r);
      const arr = byStudent.get(r.studentId);
      if (arr) arr.push(r);
      else byStudent.set(r.studentId, [r]);
    }

    const { start } = this.reports.localDayBoundsUTC(monday);
    const { end } = this.reports.localDayBoundsUTC(friday);
    const words = await this.words.findAddedBetween(ids, start, end);
    const wordCount = new Map<string, number>();
    for (const w of words) wordCount.set(w.studentId, (wordCount.get(w.studentId) ?? 0) + 1);

    const out: WeeklyStudentRow[] = [];
    for (const s of students) {
      const perDay = dates.map((date) => {
        const r = byKey.get(`${s.id}|${date}`);
        return {
          date,
          didListening: r?.didListening ?? false,
          didReading: r?.didReading ?? false,
          active: r?.countsAsActive ?? false,
        };
      });
      const sr = byStudent.get(s.id) ?? [];
      out.push({
        fullName: s.fullName,
        username: s.username,
        userId: s.telegramUserId,
        detailQuery: s.id.slice(0, 8),
        hasBook: !!s.bookTitle,
        perDay,
        weekWords: wordCount.get(s.id) ?? 0,
        weekReviews: sr.reduce((a, r) => a + r.reviewedCount, 0),
        missedStreak: await this.reports.countConsecutiveInactiveClassDays(s.id, friday),
        aiFlag: computeAiFlag(sr),
      });
    }
    return out;
  }
}
