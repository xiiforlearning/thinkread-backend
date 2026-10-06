import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { formatInTimeZone } from 'date-fns-tz';
import { AppConfigService } from '../../config/config.service';
import { globalConfig } from '../../config/global.config';
import { ReminderPlannerService } from '../../domain/notify/reminder-planner.service';

/** A reminder fires within this many minutes after its configured time (a restart later in the day skips it). */
const WINDOW_MIN = 120;

/**
 * Every minute: once the local time passes `reminders.cardsTime` / `reportsTime`
 * (owner-editable settings, read at run time) the planner runs once for that day.
 * The reminder log keeps repeats idempotent per student.
 */
@Injectable()
export class RemindersCron {
  private readonly logger = new Logger(RemindersCron.name);
  private cardsDay: string | null = null;
  private reportsDay: string | null = null;
  private running = false;

  constructor(
    private readonly planner: ReminderPlannerService,
    private readonly config: AppConfigService,
  ) {}

  @Cron('* * * * *')
  async tick(): Promise<void> {
    if (this.running) return;
    const now = new Date();
    const tz = this.config.timezone;
    const day = formatInTimeZone(now, tz, 'yyyy-MM-dd');
    const minutes = minutesOf(formatInTimeZone(now, tz, 'HH:mm'));
    this.running = true;
    try {
      if (this.cardsDay !== day && inWindow(minutes, globalConfig.reminders.cardsTime)) {
        this.cardsDay = day;
        await this.planner.runCards(now);
      }
      if (this.reportsDay !== day && inWindow(minutes, globalConfig.reminders.reportsTime)) {
        this.reportsDay = day;
        await this.planner.runReports(now);
      }
    } catch (err) {
      this.logger.error(`reminders failed: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}

export function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function inWindow(nowMinutes: number, at: string, windowMin = WINDOW_MIN): boolean {
  const start = minutesOf(at);
  return nowMinutes >= start && nowMinutes < start + windowMin;
}
