import { addDays, format, startOfWeek } from 'date-fns';
import { formatInTimeZone, fromZonedTime, toZonedTime } from 'date-fns-tz';
import { globalConfig } from '../../config/global.config';

/**
 * Calendar helpers for norms. Timestamps are stored in UTC; "today" and "this
 * week" are always computed in the school's timezone (Asia/Tashkent).
 */

/** Local calendar day, e.g. `2026-09-28`. Also the reminder period key for daily norms. */
export function localDay(instant: Date, timeZone: string): string {
  return formatInTimeZone(instant, timeZone, 'yyyy-MM-dd');
}

/** Monday (local) of the week containing `instant`, as `YYYY-MM-DD`. Stored in `reports.week_start`. */
export function weekStart(instant: Date, timeZone: string): string {
  const zoned = toZonedTime(instant, timeZone);
  return format(
    startOfWeek(zoned, { weekStartsOn: globalConfig.norms.weekStartsOn }),
    'yyyy-MM-dd',
  );
}

/** The last `count` Monday keys, newest first (the current week first). */
export function recentWeekStarts(instant: Date, timeZone: string, count: number): string[] {
  const current = weekStart(instant, timeZone);
  const starts: string[] = [];
  let cursor = new Date(`${current}T12:00:00Z`);
  for (let i = 0; i < count; i += 1) {
    starts.push(format(cursor, 'yyyy-MM-dd'));
    cursor = addDays(cursor, -7);
  }
  return starts;
}

/** ISO week key, e.g. `2026-W40`. The reminder period key for weekly norms. */
export function weekKey(instant: Date, timeZone: string): string {
  return format(toZonedTime(instant, timeZone), "RRRR-'W'II");
}

export interface WeekBounds {
  /** Monday, `YYYY-MM-DD` (local). */
  weekStart: string;
  /** UTC instant of Monday 00:00 local — inclusive. */
  from: Date;
  /** UTC instant of next Monday 00:00 local — exclusive. */
  to: Date;
}

export function weekBounds(instant: Date, timeZone: string): WeekBounds {
  const start = weekStart(instant, timeZone);
  const from = fromZonedTime(`${start}T00:00:00`, timeZone);
  const nextMonday = format(addDays(toZonedTime(from, timeZone), 7), 'yyyy-MM-dd');
  const to = fromZonedTime(`${nextMonday}T00:00:00`, timeZone);
  return { weekStart: start, from, to };
}
