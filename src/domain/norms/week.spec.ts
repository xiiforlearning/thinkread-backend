import {
  daysLeftInSlot,
  localDay,
  slotOf,
  slotViews,
  weekBounds,
  weekKey,
  weekStart,
} from './week';

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

describe('submission windows (N1)', () => {
  const TZ = 'Asia/Tashkent';
  it('places a local day into Mon–Tue, Wed–Thu or Fri–Sun', () => {
    expect(slotOf(new Date('2026-10-05T03:00:00Z'), TZ)).toBe(1); // Monday 08:00 local
    expect(slotOf(new Date('2026-10-06T18:59:00Z'), TZ)).toBe(1); // Tuesday 23:59 local
    expect(slotOf(new Date('2026-10-06T19:00:00Z'), TZ)).toBe(2); // Wednesday 00:00 local
    expect(slotOf(new Date('2026-10-09T10:00:00Z'), TZ)).toBe(3); // Friday
    expect(slotOf(new Date('2026-10-11T18:00:00Z'), TZ)).toBe(3); // Sunday 23:00 local
    expect(daysLeftInSlot(new Date('2026-10-05T03:00:00Z'), TZ)).toBe(2);
    expect(daysLeftInSlot(new Date('2026-10-08T03:00:00Z'), TZ)).toBe(1);
    expect(daysLeftInSlot(new Date('2026-10-09T03:00:00Z'), TZ)).toBe(3);
  });

  it('shows the week as done / open / missed / upcoming windows; a missed one burns', () => {
    const thursday = new Date('2026-10-08T10:00:00Z');
    expect(slotViews('2026-10-05', new Set([2]), thursday, TZ)).toEqual([
      { slot: 1, from: '2026-10-05', to: '2026-10-06', state: 'missed' },
      { slot: 2, from: '2026-10-07', to: '2026-10-08', state: 'done' },
      { slot: 3, from: '2026-10-09', to: '2026-10-11', state: 'upcoming' },
    ]);
    expect(slotViews('2026-10-05', new Set([1]), thursday, TZ)[1].state).toBe('open');
    // A past week: nothing is open or upcoming any more.
    expect(slotViews('2026-09-28', new Set([1, 3]), thursday, TZ).map((v) => v.state)).toEqual([
      'done',
      'missed',
      'done',
    ]);
  });
});
