import { Inject, Injectable, Logger } from '@nestjs/common';
import { formatInTimeZone } from 'date-fns-tz';
import { AppConfigService } from '../../config/config.service';
import { globalConfig } from '../../config/global.config';
import { CardsService } from '../cards/cards.service';
import { ReminderChannel, ReminderKind } from '../norms/reminder-log.entity';
import { RemindersService } from '../norms/reminders.service';
import { ReportsService } from '../reports/reports.service';
import { Student } from '../students/student.entity';
import { StudentsService } from '../students/students.service';
import { reminderMessages } from './messages';
import { NOTIFIER_PORT, NotifierPort } from './notifier.port';

export interface ReminderRun {
  kind: 'CARDS' | 'REPORTS';
  /** Local day the run belongs to. */
  day: string;
  candidates: number;
  sent: number;
  skipped: { calm: number; done: number; reminded: number; failed: number; notReportDay: number };
}

/**
 * Scheduled reminders (customer rules): cards once a day at `reminders.cardsTime`,
 * reports on `reminders.reportDays` at `reminders.reportsTime` — only to students
 * whose norm is not met yet, never twice a day (the AI's woven reminder counts),
 * never in calm mode ("устал"), never to a student who blocked the bot (a failed DM counts as `failed`).
 * The scheduler and the admin "run now" button both call these.
 */
@Injectable()
export class ReminderPlannerService {
  private readonly logger = new Logger(ReminderPlannerService.name);

  constructor(
    private readonly students: StudentsService,
    private readonly reminders: RemindersService,
    private readonly reports: ReportsService,
    private readonly cards: CardsService,
    private readonly config: AppConfigService,
    @Inject(NOTIFIER_PORT) private readonly notifier: NotifierPort,
  ) {}

  async runCards(now = new Date()): Promise<ReminderRun> {
    const tz = this.config.timezone;
    const run = this.empty('CARDS', now, tz);
    const active = await this.students.findActive();
    run.candidates = active.length;
    let sentInBatch = 0;
    for (const s of active) {
      if (this.calm(s, now)) {
        run.skipped.calm += 1;
        continue;
      }
      const pending = await this.reminders.pendingToday(s.id, now, tz);
      if (!pending.includes(ReminderKind.CARDS)) {
        run.skipped.reminded += 1;
        continue;
      }
      const today = await this.cards.today(s.id, now, tz);
      if (today.done >= today.norm) {
        run.skipped.done += 1;
        continue;
      }
      const due = await this.cards.queue(s.id, now, tz, 50);
      if (due.length === 0) {
        run.skipped.done += 1;
        continue;
      }
      const ok = await this.notifier.sendToUser(
        s.telegramUserId,
        reminderMessages.cards(
          Math.min(due.length, today.norm - today.done),
          today.done,
          today.norm,
        ),
        { openApp: true },
      );
      if (!ok) {
        run.skipped.failed += 1;
        continue;
      }
      await this.reminders.mark(s.id, ReminderKind.CARDS, ReminderChannel.SCHEDULED, now, tz);
      run.sent += 1;
      sentInBatch = await this.throttle(sentInBatch);
    }
    this.log(run);
    return run;
  }

  /** `force` ignores `reportDays` (the admin "run now"). */
  async runReports(now = new Date(), force = false): Promise<ReminderRun> {
    const tz = this.config.timezone;
    const run = this.empty('REPORTS', now, tz);
    const weekday = Number(formatInTimeZone(now, tz, 'i')) % 7; // 0 = Sunday
    if (!force && !globalConfig.reminders.reportDays.includes(weekday)) {
      run.skipped.notReportDay = 1;
      return run;
    }
    const active = await this.students.findActive();
    run.candidates = active.length;
    const daysLeft = 7 - (((weekday + 6) % 7) % 7); // Monday → 7 … Sunday → 1
    let sentInBatch = 0;
    for (const s of active) {
      if (this.calm(s, now)) {
        run.skipped.calm += 1;
        continue;
      }
      const progress = await this.reports.weekProgress(s.id, now, tz);
      const missing = {
        reading: Math.max(0, progress.readingNorm - progress.reading),
        listening: Math.max(0, progress.listeningNorm - progress.listening),
      };
      if (missing.reading === 0 && missing.listening === 0) {
        run.skipped.done += 1;
        continue;
      }
      const pending = await this.reminders.pendingToday(s.id, now, tz);
      const kinds = [
        ...(missing.reading > 0 ? [ReminderKind.READING] : []),
        ...(missing.listening > 0 ? [ReminderKind.LISTENING] : []),
      ].filter((k) => pending.includes(k));
      if (kinds.length === 0) {
        run.skipped.reminded += 1;
        continue;
      }
      const ok = await this.notifier.sendToUser(
        s.telegramUserId,
        reminderMessages.reports(
          {
            reading: kinds.includes(ReminderKind.READING) ? missing.reading : 0,
            listening: kinds.includes(ReminderKind.LISTENING) ? missing.listening : 0,
          },
          { reading: progress.readingNorm, listening: progress.listeningNorm },
          daysLeft,
        ),
        { openApp: true },
      );
      if (!ok) {
        run.skipped.failed += 1;
        continue;
      }
      for (const kind of kinds)
        await this.reminders.mark(s.id, kind, ReminderChannel.SCHEDULED, now, tz);
      run.sent += 1;
      sentInBatch = await this.throttle(sentInBatch);
    }
    this.log(run);
    return run;
  }

  private calm(s: Student, now: Date): boolean {
    const until = s.dialogState?.tiredUntil;
    return !!until && new Date(until).getTime() > now.getTime();
  }

  private empty(kind: ReminderRun['kind'], now: Date, tz: string): ReminderRun {
    return {
      kind,
      day: formatInTimeZone(now, tz, 'yyyy-MM-dd'),
      candidates: 0,
      sent: 0,
      skipped: { calm: 0, done: 0, reminded: 0, failed: 0, notReportDay: 0 },
    };
  }

  /** Stay under Telegram's broadcast limit: a one-second pause after each batch. */
  private async throttle(sentInBatch: number): Promise<number> {
    const next = sentInBatch + 1;
    if (next >= globalConfig.telegram.broadcastPerSecond) {
      await new Promise((r) => setTimeout(r, 1000));
      return 0;
    }
    return next;
  }

  private log(run: ReminderRun): void {
    const s = run.skipped;
    this.logger.log(
      `${run.kind} reminders ${run.day}: sent=${run.sent} of ${run.candidates} (calm=${s.calm} done=${s.done} reminded=${s.reminded} failed=${s.failed})`,
    );
  }
}
