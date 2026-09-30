export const wordMessages = {
  importPreview: (found: number, duplicates: number, toAdd: number): string =>
    [
      `Нашёл ${found} ${plural(found, 'слово', 'слова', 'слов')}` +
        (duplicates > 0
          ? `, ${duplicates} уже есть в словаре — ${duplicates === 1 ? 'его' : 'их'} пропущу.`
          : '.'),
      toAdd > 0 ? `Добавить ${toAdd}?` : 'Добавлять нечего — всё уже в словаре.',
    ].join(' '),
  importConfirmed: (added: number): string =>
    `Добавил ${added} ${plural(added, 'слово', 'слова', 'слов')} — все со статусом «изучается». Перевод и примеры подберу в фоне, карточки начнутся завтра.`,
  importCancelled: 'Хорошо, ничего не добавляю.',
  importExpired: 'Этот список уже устарел — пришли слова ещё раз.',
  importNotYours: 'Эта кнопка не для тебя.',
  fileUnsupported:
    'Пока принимаю списки слов файлами .txt, .csv и .xlsx. Или просто пришли слова текстом.',
  fileEmpty:
    'В файле не нашёл английских слов. Проверь, что слова в первой колонке или по одному в строке.',
  confirmButton: (n: number): string => `Добавить ${n}`,
  cancelButton: 'Отмена',
  exportFilename: (format: 'csv' | 'txt', date: string): string =>
    `thinkread-words-${date}.${format}`,
};

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
