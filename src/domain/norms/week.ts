import { addDays, format, getISODay, parseISO, startOfWeek } from 'date-fns';
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

/**
 * Has the school started counting by `instant` (local day ≥ `norms.startsOn`)? The week of the
 * move to ThinkRead is a grace week: before the start date nobody is silent, no flags, no
 * reminders, no Monday summary. An empty start date means "from the beginning".
 */
export function normsStarted(
  instant: Date,
  timeZone: string,
  startsOn: string = globalConfig.norms.startsOn,
): boolean {
  return !startsOn || localDay(instant, timeZone) >= startsOn;
}

/** The start of counting as an instant (local midnight of `norms.startsOn`), or null when unset. */
export function normsStartInstant(
  timeZone: string,
  startsOn: string = globalConfig.norms.startsOn,
): Date | null {
  return startsOn ? fromZonedTime(`${startsOn}T00:00:00`, timeZone) : null;
}

/** 1, 2 or 3 — the submission window a local day belongs to (`norms.slotWindows`). */
export function slotOf(instant: Date, timeZone: string): number {
  const weekday = getISODay(toZonedTime(instant, timeZone));
  const idx = globalConfig.norms.slotWindows.findIndex((days) => days.includes(weekday));
  return idx < 0 ? globalConfig.norms.slotWindows.length : idx + 1;
}

/** How many windows a week has — the weekly norm of each report type under N1. */
export function slotsPerWeek(): number {
  return globalConfig.norms.slotWindows.length;
}

export type SlotState = 'done' | 'open' | 'missed' | 'upcoming';

export interface SlotView {
  slot: number;
  /** First and last local day of the window, `YYYY-MM-DD`. */
  from: string;
  to: string;
  state: SlotState;
}

/**
 * The windows of the week starting on `weekStart` as the student sees them at `now`: filled
 * ones are done, the one containing today is open, earlier empty ones are missed (they burn),
 * later ones are upcoming.
 */
export function slotViews(
  weekStart: string,
  filled: ReadonlySet<number>,
  now: Date,
  timeZone: string,
): SlotView[] {
  const monday = parseISO(`${weekStart}T00:00:00`);
  const today = localDay(now, timeZone);
  return globalConfig.norms.slotWindows.map((days, i) => {
    const from = format(addDays(monday, days[0] - 1), 'yyyy-MM-dd');
    const to = format(addDays(monday, days[days.length - 1] - 1), 'yyyy-MM-dd');
    const slot = i + 1;
    const state: SlotState = filled.has(slot)
      ? 'done'
      : today > to
        ? 'missed'
        : today < from
          ? 'upcoming'
          : 'open';
    return { slot, from, to, state };
  });
}

/** Local days left in the current window, counting today (1 = the window closes today). */
export function daysLeftInSlot(now: Date, timeZone: string): number {
  const weekday = getISODay(toZonedTime(now, timeZone));
  const days = globalConfig.norms.slotWindows[slotOf(now, timeZone) - 1];
  return days[days.length - 1] - weekday + 1;
}
