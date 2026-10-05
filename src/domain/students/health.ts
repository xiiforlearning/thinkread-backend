import { globalConfig } from '../../config/global.config';

/**
 * Student "health" — one function for the dashboard, the Mini App and the
 * weekly summary. Green = active, yellow = falling behind, red = problem.
 * Based on silence (days since the last activity) and a blocked bot.
 */
export type Health = 'good' | 'warn' | 'bad';

export interface HealthInput {
  lastActivityAt: Date | null;
  registeredAt: Date;
  dmBlocked: boolean;
}

export interface HealthThresholds {
  yellowInactiveDays: number;
  redInactiveDays: number;
}

const DAY_MS = 86_400_000;

/** Whole days since the last activity (registration counts as activity). */
export function silentDays(
  input: Pick<HealthInput, 'lastActivityAt' | 'registeredAt'>,
  now: Date,
): number {
  const last = input.lastActivityAt ?? input.registeredAt;
  return Math.max(0, Math.floor((now.getTime() - last.getTime()) / DAY_MS));
}

export function healthOf(
  input: HealthInput,
  now: Date,
  thresholds: HealthThresholds = globalConfig.health,
): Health {
  if (input.dmBlocked) return 'bad';
  const silent = silentDays(input, now);
  if (silent >= thresholds.redInactiveDays) return 'bad';
  if (silent >= thresholds.yellowInactiveDays) return 'warn';
  return 'good';
}
