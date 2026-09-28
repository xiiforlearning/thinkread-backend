import { Injectable } from '@nestjs/common';
import { GroupsService } from '../../domain/groups/groups.service';
import { DailyReport } from '../../domain/reports/daily-report.entity';
import { ReportsService } from '../../domain/reports/reports.service';
import {
  DetailDay,
  DetailWord,
  formatStudentDetail,
} from '../../domain/reports/student-detail-formatter';
import { Student } from '../../domain/students/student.entity';
import { StudentsService } from '../../domain/students/students.service';
import { WordsService } from '../../domain/words/words.service';
import type { ReportWindow, WeekMode } from './weekly-report-builder.service';

export interface StudentResolution {
  student?: Student;
  candidates?: Student[];
}

@Injectable()
export class StudentDetailBuilderService {
  constructor(
    private readonly groups: GroupsService,
    private readonly students: StudentsService,
    private readonly reports: ReportsService,
    private readonly words: WordsService,
  ) {}

  /**
   * Resolve a student by uuid-prefix, @username, or name substring — restricted
   * to the given accessible group chat ids. Returns a single match, or a
   * candidate list when ambiguous.
   */
  async resolve(query: string, accessibleChatIds: number[]): Promise<StudentResolution> {
    const pool = await this.students.findByChats(accessibleChatIds);
    const q = query.trim().toLowerCase();
    const bare = q.startsWith('@') ? q.slice(1) : q;

    const exact = pool.filter(
      (s) =>
        s.id.toLowerCase() === q ||
        s.id.toLowerCase().startsWith(bare) ||
        (s.username && s.username.toLowerCase() === bare),
    );
    if (exact.length === 1) return { student: exact[0] };
    if (exact.length > 1) return { candidates: exact };

    const byName = pool.filter((s) => s.fullName.toLowerCase().includes(bare));
    if (byName.length === 1) return { student: byName[0] };
    if (byName.length > 1) return { candidates: byName };
    return {};
  }

  /** Build the detailed per-student report over the class week for `mode`. */
  async buildDetail(student: Student, mode: WeekMode = 'toDate'): Promise<string> {
    return this.buildForWindow(student, this.reports.weekBounds(new Date(), mode));
  }

  /** Build the detail over an explicit window (demo tools use a rolling window). */
  async buildForWindow(student: Student, window: ReportWindow): Promise<string> {
    const { monday, friday, dates } = window;
    const group = await this.groups.findById(student.chatId);

    const dailyRows = await this.reports.findBetweenDatesForStudents(monday, friday, [student.id]);
    const byDate = new Map<string, DailyReport>(dailyRows.map((r) => [r.date, r]));

    const { start } = this.reports.localDayBoundsUTC(monday);
    const { end } = this.reports.localDayBoundsUTC(friday);
    const wordRows = await this.words.findAddedBetween([student.id], start, end);
    const wordLocalDate = (addedAt: Date): string => this.reports.todayDateString(addedAt);

    const wordsPerDay = new Map<string, number>();
    for (const w of wordRows) {
      const d = wordLocalDate(w.addedAt);
      wordsPerDay.set(d, (wordsPerDay.get(d) ?? 0) + 1);
    }

    const days: DetailDay[] = dates.map((date) => {
      const r = byDate.get(date);
      return {
        date,
        didReading: r?.didReading ?? false,
        didListening: r?.didListening ?? false,
        words: wordsPerDay.get(date) ?? 0,
        page: r?.pageReached ?? null,
        reviews: r?.reviewedCount ?? 0,
      };
    });

    const detailWords: DetailWord[] = wordRows.map((w) => ({
      date: wordLocalDate(w.addedAt),
      word: w.word,
      translation: w.translation,
      exerciseType: w.exerciseType,
    }));
    const listeningWordCount = detailWords.filter((w) => w.exerciseType === 'listening').length;
    const readingWordCount = detailWords.length - listeningWordCount;

    const flash = await this.words.statsForStudent(student.id);
    const recallCorrect = dailyRows.reduce((a, r) => a + (r.firstCheckCorrect ?? 0), 0);
    const recallTotal = dailyRows.reduce((a, r) => a + (r.firstCheckTotal ?? 0), 0);
    const forwardedDays = dailyRows.filter((r) => r.wordsForwarded).length;

    return formatStudentDetail({
      fullName: student.fullName,
      username: student.username,
      userId: student.telegramUserId,
      groupTitle: group?.title ?? '—',
      bookTitle: student.bookTitle,
      currentPage: student.currentPage,
      totalPages: student.bookTotalPages,
      monday,
      friday,
      days,
      words: detailWords,
      listeningWordCount,
      readingWordCount,
      flash,
      auth: { recallCorrect, recallTotal, forwardedDays },
    });
  }
}
