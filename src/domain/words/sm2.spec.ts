import { applyKnew, applyNope, nextReviewDate, Sm2State } from './sm2';

const fresh = (): Sm2State => ({
  intervalDays: 1,
  ease: 2.5,
  reviewCount: 0,
  lapses: 0,
});

describe('SM-2 simplified', () => {
  describe('applyKnew', () => {
    it('first knew (reviewCount=0) sets interval to 1', () => {
      const next = applyKnew(fresh());
      expect(next.intervalDays).toBe(1);
      expect(next.reviewCount).toBe(1);
      expect(next.ease).toBeCloseTo(2.55, 5);
      expect(next.lapses).toBe(0);
    });

    it('second knew (reviewCount=1) sets interval to 3', () => {
      const next = applyKnew({ intervalDays: 1, ease: 2.55, reviewCount: 1, lapses: 0 });
      expect(next.intervalDays).toBe(3);
      expect(next.reviewCount).toBe(2);
      expect(next.ease).toBeCloseTo(2.6, 5);
    });

    it('third+ knew uses round(intervalDays * ease)', () => {
      // intervalDays=3, ease=2.6 → round(7.8)=8
      const next = applyKnew({ intervalDays: 3, ease: 2.6, reviewCount: 2, lapses: 0 });
      expect(next.intervalDays).toBe(8);
      expect(next.reviewCount).toBe(3);
      expect(next.ease).toBeCloseTo(2.65, 5);
    });

    it('caps ease at 2.7', () => {
      const next = applyKnew({ intervalDays: 10, ease: 2.7, reviewCount: 5, lapses: 0 });
      expect(next.ease).toBe(2.7);
    });

    it('caps ease at 2.7 even if it would overshoot', () => {
      const next = applyKnew({ intervalDays: 10, ease: 2.69, reviewCount: 5, lapses: 0 });
      expect(next.ease).toBeCloseTo(2.7, 5);
    });

    it('does not increment lapses', () => {
      const next = applyKnew({ intervalDays: 5, ease: 2.4, reviewCount: 3, lapses: 7 });
      expect(next.lapses).toBe(7);
    });

    it('rounds half-integer multiplications', () => {
      // intervalDays=5, ease=2.5 → 12.5 → round → 13 (Math.round uses half-to-even? No, away-from-zero)
      const next = applyKnew({ intervalDays: 5, ease: 2.5, reviewCount: 2, lapses: 0 });
      expect(next.intervalDays).toBe(13);
    });
  });

  describe('applyNope', () => {
    it('resets interval to 1', () => {
      const next = applyNope({ intervalDays: 10, ease: 2.5, reviewCount: 3, lapses: 0 });
      expect(next.intervalDays).toBe(1);
    });

    it('decrements ease by 0.2', () => {
      const next = applyNope({ intervalDays: 10, ease: 2.5, reviewCount: 3, lapses: 0 });
      expect(next.ease).toBeCloseTo(2.3, 5);
    });

    it('floors ease at 1.3', () => {
      const next = applyNope({ intervalDays: 5, ease: 1.3, reviewCount: 3, lapses: 0 });
      expect(next.ease).toBe(1.3);
    });

    it('floors ease at 1.3 even when about to undershoot', () => {
      const next = applyNope({ intervalDays: 5, ease: 1.4, reviewCount: 3, lapses: 0 });
      expect(next.ease).toBeCloseTo(1.3, 5);
    });

    it('increments lapses and reviewCount', () => {
      const next = applyNope({ intervalDays: 5, ease: 2.0, reviewCount: 3, lapses: 1 });
      expect(next.lapses).toBe(2);
      expect(next.reviewCount).toBe(4);
    });
  });

  describe('nextReviewDate', () => {
    it('adds N days to now', () => {
      const now = new Date('2026-06-01T10:00:00Z');
      const next = nextReviewDate(3, now);
      expect(next.toISOString()).toBe('2026-06-04T10:00:00.000Z');
    });

    it('uses default = current time when no arg given', () => {
      const before = Date.now();
      const next = nextReviewDate(1).getTime();
      const after = Date.now();
      // Should be ~24h ahead
      expect(next).toBeGreaterThanOrEqual(before + 86_400_000 - 1000);
      expect(next).toBeLessThanOrEqual(after + 86_400_000 + 1000);
    });
  });
});
