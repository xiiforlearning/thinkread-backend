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
        ? 'Сегодня последний день недели'
        : `До конца недели ${daysLeft} ${plural(daysLeft, 'день', 'дня', 'дней')}`;
    return `${left}. Осталось: ${parts.join(', ')}. Отчёт сдаётся в приложении — одним сообщением.`;
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
        ? 'Today is the last day of the week'
        : `${daysLeft} ${pluralEn(daysLeft, 'day', 'days')} left in the week`;
    return `${left}. Still to do: ${parts.join(', ')}. Reports are handed in in the app — one message each.`;
  },
};

export const reminderTexts: Record<Lang, ReminderTexts> = { ru, en };

/** Reminder texts in the student's language. */
export function reminderMessagesFor(lang: Lang): ReminderTexts {
  return reminderTexts[lang];
}

/** The Russian texts — kept for callers without a student. */
export const reminderMessages: ReminderTexts = ru;

export const summaryMessages = {
  title: (weekLabel: string): string => `Итоги недели ${weekLabel}`,
  noStudents: 'Активных студентов пока нет.',
};
