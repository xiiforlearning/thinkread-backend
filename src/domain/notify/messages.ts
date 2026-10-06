import { plural } from '../../common/plural';

/** Outgoing Telegram texts: reminders to students, the weekly summary to staff. */
export const reminderMessages = {
  cards: (due: number, done: number, norm: number): string =>
    `Карточки ждут: ${due} ${plural(due, 'слово', 'слова', 'слов')} на сегодня${done > 0 ? ` (уже ${done} из ${norm})` : ''}. Пять минут — и норма дня закрыта.`,
  reports: (
    missing: { reading: number; listening: number },
    norm: { reading: number; listening: number },
    daysLeft: number,
  ): string => {
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

export const summaryMessages = {
  title: (weekLabel: string): string => `Итоги недели ${weekLabel}`,
  noStudents: 'Активных студентов пока нет.',
};
