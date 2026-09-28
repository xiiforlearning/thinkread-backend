import { InlineKeyboardMarkup } from 'telegraf/types';
import { studentMessages } from '../../../domain/students/messages';

/**
 * Evening exercise flow (v2). Words are collected per exercise across as many
 * messages as the student wants, until they press Готово:
 *   ev:l:<0|1>     — listening answer
 *   ev:donelisten  — finish listening words → go to the reading question
 *   ev:r:<0|1>     — reading answer
 *   ev:donereading — finish reading words → optional page / done
 *   ev:skippage    — skip the optional page step
 */
export const EVENING_ACTION_PREFIX = 'ev';

export const buildListeningKeyboard = (): InlineKeyboardMarkup => ({
  inline_keyboard: [
    [
      { text: studentMessages.buttonYes, callback_data: `${EVENING_ACTION_PREFIX}:l:1` },
      { text: studentMessages.buttonNo, callback_data: `${EVENING_ACTION_PREFIX}:l:0` },
    ],
  ],
});

export const buildReadingKeyboard = (): InlineKeyboardMarkup => ({
  inline_keyboard: [
    [
      { text: studentMessages.buttonYes, callback_data: `${EVENING_ACTION_PREFIX}:r:1` },
      { text: studentMessages.buttonNo, callback_data: `${EVENING_ACTION_PREFIX}:r:0` },
    ],
  ],
});

export const buildDoneListeningKeyboard = (): InlineKeyboardMarkup => ({
  inline_keyboard: [
    [{ text: studentMessages.buttonDone, callback_data: `${EVENING_ACTION_PREFIX}:donelisten` }],
  ],
});

export const buildDoneReadingKeyboard = (): InlineKeyboardMarkup => ({
  inline_keyboard: [
    [{ text: studentMessages.buttonDone, callback_data: `${EVENING_ACTION_PREFIX}:donereading` }],
  ],
});

export const buildSkipPageKeyboard = (): InlineKeyboardMarkup => ({
  inline_keyboard: [
    [{ text: studentMessages.buttonSkip, callback_data: `${EVENING_ACTION_PREFIX}:skippage` }],
  ],
});
