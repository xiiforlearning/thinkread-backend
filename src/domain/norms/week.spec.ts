import { localDay, weekBounds, weekKey, weekStart } from './week';

const TZ = 'Asia/Tashkent'; // UTC+5, no DST

describe('week helpers (Asia/Tashkent)', () => {
  it('uses the local day, not the UTC day', () => {
    // Sunday 20:30 UTC = Monday 01:30 in Tashkent.
    const instant = new Date('2026-09-27T20:30:00Z');
    expect(localDay(instant, TZ)).toBe('2026-09-28');
  });

  it('starts the week on Monday local time', () => {
    expect(weekStart(new Date('2026-09-27T20:30:00Z'), TZ)).toBe('2026-09-28');
    // Sunday 18:00 UTC = Sunday 23:00 local → still the previous week.
    expect(weekStart(new Date('2026-09-27T18:00:00Z'), TZ)).toBe('2026-09-21');
    // Mid-week.
    expect(weekStart(new Date('2026-10-01T09:00:00Z'), TZ)).toBe('2026-09-28');
  });

  it('builds ISO week keys', () => {
    expect(weekKey(new Date('2026-10-01T09:00:00Z'), TZ)).toBe('2026-W40');
    // ISO week-numbering year differs from calendar year around New Year.
    expect(weekKey(new Date('2027-01-01T09:00:00Z'), TZ)).toBe('2026-W53');
  });

  it('returns UTC bounds of the local week', () => {
    const b = weekBounds(new Date('2026-10-01T09:00:00Z'), TZ);
    expect(b.weekStart).toBe('2026-09-28');
    expect(b.from.toISOString()).toBe('2026-09-27T19:00:00.000Z');
    expect(b.to.toISOString()).toBe('2026-10-04T19:00:00.000Z');
  });
});
