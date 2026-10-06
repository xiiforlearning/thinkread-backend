import { healthOf, silentDays } from './health';

const DAY = 86_400_000;
const now = new Date('2026-10-05T12:00:00Z');
const thresholds = { yellowInactiveDays: 4, redInactiveDays: 8 };

describe('health', () => {
  it('counts whole days of silence, falling back to the registration date', () => {
    expect(
      silentDays({ lastActivityAt: new Date(now.getTime() - 3.9 * DAY), registeredAt: now }, now),
    ).toBe(3);
    expect(
      silentDays({ lastActivityAt: null, registeredAt: new Date(now.getTime() - 10 * DAY) }, now),
    ).toBe(10);
    expect(
      silentDays({ lastActivityAt: new Date(now.getTime() + DAY), registeredAt: now }, now),
    ).toBe(0);
  });

  it('is green under the yellow threshold, yellow between, red from the red threshold', () => {
    const at = (
      days: number,
    ): { lastActivityAt: Date; registeredAt: Date; dmBlocked: boolean } => ({
      lastActivityAt: new Date(now.getTime() - days * DAY),
      registeredAt: now,
      dmBlocked: false,
    });
    expect(healthOf(at(0), now, thresholds)).toBe('good');
    expect(healthOf(at(3), now, thresholds)).toBe('good');
    expect(healthOf(at(4), now, thresholds)).toBe('warn');
    expect(healthOf(at(7), now, thresholds)).toBe('warn');
    expect(healthOf(at(8), now, thresholds)).toBe('bad');
  });

  it('a blocked bot is always a problem', () => {
    expect(
      healthOf({ lastActivityAt: now, registeredAt: now, dmBlocked: true }, now, thresholds),
    ).toBe('bad');
  });
});
