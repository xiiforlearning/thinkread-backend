import { plural } from '../../common/plural';
import { Lang, pluralEn } from '../students/language';

type Missing = { reading: number; listening: number };

export interface ReminderTexts {
  cards: (due: number, done: number, norm: number) => string;
  reports: (missing: Missing, norm: Missing, daysLeft: number) => string;
}

/** Outgoing Telegram texts: reminders to students (per language), the weekly summary to staff. */
const ru: ReminderTexts = {
  cards: (due, done, norm) =>
    `Карточки ждут: ${due} ${plural(due, 'слово', 'слова', 'слов')} на сегодня${done > 0 ? ` (уже ${done} из ${norm})` : ''}. Пять минут — и норма дня закрыта.`,
  reports: (missing, norm, daysLeft) => {
    const parts: string[] = [];
    if (missing.reading > 0) parts.push(`чтение — ещё ${missing.reading} из ${norm.reading}`);
    if (missing.listening > 0)
      parts.push(`аудирование — ещё ${missing.listening} из ${norm.listening}`);
    const left =
      daysLeft <= 1
        ? 'The submission window closes today'
        : `The submission window closes in ${daysLeft} ${pluralEn(daysLeft, 'day', 'days')}`;
    return `${left}. Still open this week: ${parts.join(', ')}. A missed window cannot be made up later — submit the report in the app in one message.`;
  },
};

const en: ReminderTexts = {
  cards: (due, done, norm) =>
    `Cards are waiting: ${due} ${pluralEn(due, 'word', 'words')} for today${done > 0 ? ` (${done} of ${norm} done)` : ''}. Five minutes and the day's norm is closed.`,
  reports: (missing, norm, daysLeft) => {
    const parts: string[] = [];
    if (missing.reading > 0) parts.push(`reading — ${missing.reading} more of ${norm.reading}`);
    if (missing.listening > 0)
      parts.push(`listening — ${missing.listening} more of ${norm.listening}`);
    const left =
      daysLeft <= 1
        ? 'The submission window closes today'
        : `The submission window closes in ${daysLeft} ${pluralEn(daysLeft, 'day', 'days')}`;
    return `${left}. Still open this week: ${parts.join(', ')}. A missed window cannot be made up later — submit the report in the app in one message.`;
  },
};

export const reminderTexts: Record<Lang, ReminderTexts> = { ru, en };

/** Reminder texts in the student's language. */
export function reminderMessagesFor(lang: Lang): ReminderTexts {
  return reminderTexts[lang];
}

/** The Russian texts — kept for callers that name the language explicitly. */
export const reminderMessages: ReminderTexts = ru;

export const summaryMessages = {
  title: (weekLabel: string): string => `Итоги недели ${weekLabel}`,
  noStudents: 'Активных студентов пока нет.',
};
