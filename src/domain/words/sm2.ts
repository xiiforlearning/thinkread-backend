import { globalConfig } from '../../config/global.config';

export interface Sm2State {
  intervalDays: number;
  ease: number;
  reviewCount: number;
  lapses: number;
}

const { minEase, maxEase, easeIncrement, easeDecrement, firstIntervalDays, secondIntervalDays } =
  globalConfig.spacedRepetition;

/** "Знал" — student answered correctly. */
export function applyKnew(state: Sm2State): Sm2State {
  let intervalDays: number;
  if (state.reviewCount === 0) {
    intervalDays = firstIntervalDays;
  } else if (state.reviewCount === 1) {
    intervalDays = secondIntervalDays;
  } else {
    intervalDays = Math.round(state.intervalDays * state.ease);
  }
  return {
    intervalDays,
    ease: Math.min(maxEase, state.ease + easeIncrement),
    reviewCount: state.reviewCount + 1,
    lapses: state.lapses,
  };
}

/** "Не знал" — student answered incorrectly. */
export function applyNope(state: Sm2State): Sm2State {
  return {
    intervalDays: firstIntervalDays,
    ease: Math.max(minEase, state.ease - easeDecrement),
    reviewCount: state.reviewCount + 1,
    lapses: state.lapses + 1,
  };
}

export function nextReviewDate(intervalDays: number, now: Date = new Date()): Date {
  const next = new Date(now);
  next.setDate(next.getDate() + intervalDays);
  return next;
}
