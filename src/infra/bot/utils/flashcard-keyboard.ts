import { InlineKeyboardMarkup } from 'telegraf/types';
import { studentMessages } from '../../../domain/students/messages';
import { wordMessages } from '../../../domain/words/messages';

export const CARD_ACTION_PREFIX = 'card';
export const REVIEW_ACTION_PREFIX = 'review';

/** Morning DM button: open the review session on demand (callback `review:open`). */
export const buildReviewOpenKeyboard = (due: number): InlineKeyboardMarkup => ({
  inline_keyboard: [
    [
      {
        text: studentMessages.buttonReviewOpen(due),
        callback_data: `${REVIEW_ACTION_PREFIX}:open`,
      },
    ],
  ],
});

/**
 * `remaining` is the number of cards left in the session AFTER this card is answered.
 * It rides along through callback_data so the session size is enforced statelessly.
 */
export const buildRevealKeyboard = (wordId: string, remaining: number): InlineKeyboardMarkup => ({
  inline_keyboard: [
    [
      {
        text: wordMessages.buttonReveal,
        callback_data: `${CARD_ACTION_PREFIX}:reveal:${wordId}:${remaining}`,
      },
    ],
  ],
});

export const buildAnswerKeyboard = (wordId: string, remaining: number): InlineKeyboardMarkup => ({
  inline_keyboard: [
    [
      {
        text: wordMessages.buttonKnew,
        callback_data: `${CARD_ACTION_PREFIX}:know:${wordId}:${remaining}`,
      },
      {
        text: wordMessages.buttonNope,
        callback_data: `${CARD_ACTION_PREFIX}:nope:${wordId}:${remaining}`,
      },
    ],
  ],
});

/**
 * Build the "how many cards do you want?" prompt keyboard.
 * Strategy: 20, 50, 100 (if total allows), plus "Все N". Caller passes
 * already-filtered sizes (no duplicates, all <= total).
 */
export const buildSessionSizeKeyboard = (
  sizes: number[],
  totalDue: number,
): InlineKeyboardMarkup => {
  const rows = sizes
    .filter((s) => s < totalDue)
    .map((s) => [
      { text: wordMessages.buttonSizeFixed(s), callback_data: `${REVIEW_ACTION_PREFIX}:start:${s}` },
    ]);
  rows.push([
    {
      text: wordMessages.buttonSizeAll(totalDue),
      callback_data: `${REVIEW_ACTION_PREFIX}:start:${totalDue}`,
    },
  ]);
  return { inline_keyboard: rows };
};
