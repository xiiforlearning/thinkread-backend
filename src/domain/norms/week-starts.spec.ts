import { recentWeekStarts } from './week';

describe('recentWeekStarts', () => {
  const tz = 'Asia/Tashkent';

  it('starts with the current local Monday and walks back a week at a time', () => {
    // Sunday 2026-10-04 23:30 UTC is already Monday 2026-10-05 04:30 in Tashkent.
    const now = new Date('2026-10-04T23:30:00Z');
    expect(recentWeekStarts(now, tz, 3)).toEqual(['2026-10-05', '2026-09-28', '2026-09-21']);
  });

  it('returns an empty list for zero weeks', () => {
    expect(recentWeekStarts(new Date(), tz, 0)).toEqual([]);
  });
});
