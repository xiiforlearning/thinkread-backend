import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf } from 'telegraf';
import { ServiceCode } from '../../common/codes';
import { AppConfigService } from '../../config/config.service';
import { globalConfig } from '../../config/global.config';
import { GroupsService } from '../../domain/groups/groups.service';
import { presentationMessages } from '../../domain/presentations/messages';
import { PresentationsService } from '../../domain/presentations/presentations.service';
import { ReportsService } from '../../domain/reports/reports.service';
import { studentMessages } from '../../domain/students/messages';
import { Student } from '../../domain/students/student.entity';
import { StudentState } from '../../domain/students/student-state.enum';
import { StudentsService } from '../../domain/students/students.service';
import { WordsService } from '../../domain/words/words.service';
import { buildListeningKeyboard } from '../bot/utils/evening-keyboard';
import { buildReviewOpenKeyboard } from '../bot/utils/flashcard-keyboard';
import { splitByNewlines } from '../bot/utils/split-message';
import { ReportWindow, WeeklyReportBuilderService } from '../report-builder/weekly-report-builder.service';

const CRON_OPTS = { timeZone: 'Asia/Tashkent' as const };

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);
  private readonly tag = `[svc=${ServiceCode.SCHEDULER}]`;

  constructor(
    @InjectBot() private readonly bot: Telegraf,
    private readonly config: AppConfigService,
    private readonly students: StudentsService,
    private readonly words: WordsService,
    private readonly groupsSvc: GroupsService,
    private readonly reports: ReportsService,
    private readonly presentations: PresentationsService,
    private readonly weekly: WeeklyReportBuilderService,
  ) {}

  /**
   * Saturday 09:00 — weekly report for the just-finished Mon–Fri:
   * - Super-admin gets the full cross-group report in their DM.
   * - Each group's teachers get their group report in DM (best-effort).
   * - Unless opted out (`groupReportsEnabled = false`), it is also posted in the
   *   group chat — guarded by `lastWeeklyReportOn` so a re-run does not double-post.
   */
  @Cron('0 9 * * 6', CRON_OPTS)
  async weeklyReportCron(): Promise<void> {
    this.logger.log(`${this.tag} CRON Sat 09:00 — weeklyReport start`);
    const window = this.reports.weekBounds(new Date(), 'lastComplete');
    const res = await this.dispatchWeekly(window, { postToGroups: true, guard: true });
    this.logger.log(
      `${this.tag} CRON Sat 09:00 — weeklyReport done (super-admin + ${res.groupPosts} group posts + ${res.teacherDms} teacher DMs)`,
    );
  }

  /**
   * Build and fan out the weekly report over `window`: super-admin DM (all
   * groups), each group's teachers in DM, and — if `postToGroups` — the group
   * chat itself (guarded by `lastWeeklyReportOn` when `guard` is set, to avoid
   * a double public post). Returns how many sends happened.
   */
  async dispatchWeekly(
    window: ReportWindow,
    opts: { postToGroups: boolean; guard: boolean },
  ): Promise<{ teacherDms: number; groupPosts: number }> {
    let groupPosts = 0;
    let teacherDms = 0;
    try {
      const fullChunks = await this.weekly.buildForAllActiveWindow(window);
      await this.sendChunksTo(this.config.adminTelegramId, fullChunks, 'weekly:super-admin');

      const groups = await this.groupsSvc.findAllActive();
      for (const group of groups) {
        try {
          const chunks = await this.weekly.buildForGroupChatWindow(group.chatId, window);

          for (const tid of group.teacherTelegramIds) {
            if (tid === this.config.adminTelegramId) continue;
            await this.sendChunksTo(tid, chunks, `weekly:dm-teacher=${tid}:group=${group.chatId}`);
            teacherDms += 1;
          }

          const guardOk = !opts.guard || group.lastWeeklyReportOn !== window.friday;
          if (opts.postToGroups && group.groupReportsEnabled && guardOk) {
            await this.sendChunksTo(group.chatId, chunks, `weekly:group=${group.chatId}`);
            if (opts.guard) await this.groupsSvc.setLastWeeklyReportOn(group.chatId, window.friday);
            groupPosts += 1;
          }
        } catch (err) {
          this.logger.error(`weeklyReport: per-group ${group.chatId} failed`, err as Error);
        }
      }
    } catch (err) {
      this.logger.error('weeklyReport: failed to build/send', err as Error);
    }
    return { teacherDms, groupPosts };
  }

  /** Send pre-chunked report messages; each chunk is re-split defensively on newlines. */
  private async sendChunksTo(chatId: number, chunks: string[], label: string): Promise<void> {
    for (const chunk of chunks) {
      for (const part of splitByNewlines(chunk, globalConfig.reports.maxMessageLength)) {
        try {
          await this.bot.telegram.sendMessage(chatId, part, {
            parse_mode: 'HTML',
            link_preview_options: { is_disabled: true },
          });
        } catch (err) {
          const description =
            (err as { description?: string }).description ?? (err as Error).message;
          this.logger.warn(`${label}: chunk send failed: ${description}`);
        }
      }
    }
  }

  /**
   * 08:00 — one message per active student (class days only): a homework nudge
   * plus a "review words" button when any are due. Flashcards start only on tap.
   */
  @Cron('0 8 * * *', CRON_OPTS)
  async morningCron(): Promise<void> {
    if (!this.reports.isClassDay()) {
      this.logger.log(`${this.tag} CRON 08:00 — morning skipped (not a class day)`);
      return;
    }
    this.logger.log(`${this.tag} CRON 08:00 — morning start`);
    const students = await this.students.findAllInAnyActiveGroup();
    let processed = 0;
    for (const student of students) {
      try {
        await this.sendMorningForStudent(student);
        processed += 1;
      } catch (err) {
        this.logger.error(`morningCron: student ${student.id} failed`, err as Error);
      }
    }
    this.logger.log(`${this.tag} CRON 08:00 — morning done (${processed}/${students.length} processed)`);
  }

  /** Send one student their morning nudge (+ review button if due). Returns due count. */
  async sendMorningForStudent(student: Student): Promise<number> {
    const due = await this.words.countDue(student.id);
    if (due > 0) {
      await this.dmStudent(student, studentMessages.morningReviewOffer(student.fullName, due), {
        reply_markup: buildReviewOpenKeyboard(due),
      });
    } else {
      await this.dmStudent(student, studentMessages.morningNoReview(student.fullName));
    }
    return due;
  }

  /**
   * 20:00 — kick off the evening exercise flow (class days only) for every IDLE
   * student in an active group. Sends the listening Да/Нет question; the rest of
   * the flow is driven by inline-keyboard callbacks (ExercisesHandler).
   */
  @Cron('0 20 * * *', CRON_OPTS)
  async eveningPromptCron(): Promise<void> {
    if (!this.reports.isClassDay()) {
      this.logger.log(`${this.tag} CRON 20:00 — eveningPrompt skipped (not a class day)`);
      return;
    }
    this.logger.log(`${this.tag} CRON 20:00 — eveningPrompt start`);
    const students = await this.students.findIdleInAnyActiveGroup();
    let nudged = 0;
    for (const student of students) {
      try {
        await this.promptEveningForStudent(student);
        nudged += 1;
      } catch (err) {
        this.logger.error(`eveningPrompt: student ${student.id} failed`, err as Error);
      }
    }
    this.logger.log(`${this.tag} CRON 20:00 — eveningPrompt done (${nudged}/${students.length} nudged)`);
  }

  /** Put one student into the evening exercise flow (listening Да/Нет prompt). */
  async promptEveningForStudent(student: Student): Promise<void> {
    await this.students.setState(student, StudentState.AWAITING_EVENING_EXERCISES);
    await this.dmStudent(student, studentMessages.eveningAskListening, {
      reply_markup: buildListeningKeyboard(),
    });
  }

  /**
   * 00:05 — finalize yesterday: reset stuck states always; on class days also
   * backfill missing rows and detect inactivity streaks.
   */
  @Cron('5 0 * * *', CRON_OPTS)
  async finalizeDayCron(): Promise<void> {
    this.logger.log(`${this.tag} CRON 00:05 — finalizeDay start`);

    const stuck = await this.students.findStuckInEveningStates();
    for (const s of stuck) {
      try {
        s.state = StudentState.IDLE;
        s.pendingReviewWordId = null;
        await this.students.save(s);
      } catch (err) {
        this.logger.error(`finalizeDay: reset state for ${s.id} failed`, err as Error);
      }
    }
    if (stuck.length > 0) {
      this.logger.log(`finalizeDay: reset ${stuck.length} stuck evening/recall states to IDLE`);
    }

    const yesterday = this.reports.yesterdayDateString();
    if (!this.reports.isClassDayString(yesterday)) {
      this.logger.log(`${this.tag} CRON 00:05 — finalizeDay done (${yesterday} not a class day, no rows/streaks)`);
      return;
    }

    const students = await this.students.findAllInAnyActiveGroup();
    const created = await this.reports.ensureYesterdayRowsExist(students);
    this.logger.log(`finalizeDay: created ${created} missing daily_reports rows`);

    let assigned = 0;
    for (const student of students) {
      try {
        const inactive3 = await this.reports.isInactiveFor3DaysEndingYesterday(student.id);
        if (!inactive3) continue;
        const hasPending = await this.presentations.hasPendingForStudent(student.id);
        if (hasPending) continue;
        await this.presentations.assign(student.id);
        await this.postStreakMessage(student);
        assigned += 1;
      } catch (err) {
        this.logger.error(`finalizeDay: streak check for ${student.id} failed`, err as Error);
      }
    }
    this.logger.log(`${this.tag} CRON 00:05 — finalizeDay done (presentations assigned: ${assigned})`);
  }

  private async dmStudent(
    student: Student,
    text: string,
    extra?: Parameters<Telegraf['telegram']['sendMessage']>[2],
  ): Promise<void> {
    try {
      await this.bot.telegram.sendMessage(student.telegramUserId, text, extra);
    } catch (err) {
      const code = (err as { code?: number }).code;
      const description = (err as { description?: string }).description ?? (err as Error).message;
      this.logger.warn(
        `DM to student ${student.id} (${student.telegramUserId}) failed [${code}]: ${description}`,
      );
      // 403 = "bot was blocked by the user" or "user is deactivated".
      // Mark and stop trying until they ping us again (cleared on incoming message).
      if (code === 403) {
        await this.students.markDmBlocked(student.id);
        student.dmBlocked = true;
      }
    }
  }

  private async postStreakMessage(student: Student): Promise<void> {
    const mention = presentationMessages.buildMention(student.username, student.fullName);
    const text = presentationMessages.streakBrokenGroupPost(mention);
    try {
      await this.bot.telegram.sendMessage(student.chatId, text);
    } catch (err) {
      const description = (err as { description?: string }).description ?? (err as Error).message;
      this.logger.warn(`Group post to ${student.chatId} failed: ${description}`);
    }
  }
}
