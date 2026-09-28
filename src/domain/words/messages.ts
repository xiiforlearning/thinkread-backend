import { globalConfig } from '../../config/global.config';

export const wordMessages = {
  reviewIntro: (count: number): string =>
    `У тебя ${count} ${pluralCard(count)} на повторение, поехали 👇`,

  reviewNothingDue:
    'Слов на повторение пока нет 🎉. Загляни позже или добавь новые через /words.',

  reviewDoneNoMore: 'Карточки закончились. Молодец!',

  reviewChoose: (totalDue: number): string =>
    [
      `У тебя ${totalDue} ${pluralCard(totalDue)} на повторение.`,
      `Сколько хочешь пройти сейчас?`,
    ].join('\n'),

  /** Button label like "20 (~10 мин)" */
  buttonSizeFixed: (n: number): string => `${n} (~${formatMinutes(n)})`,

  /** Button label like "Все 47 (~24 мин)" */
  buttonSizeAll: (n: number): string => `Все ${n} (~${formatMinutes(n)})`,

  cardFront: (word: string): string => word,

  cardRevealed: (word: string, translation: string): string => `${word}\n\n${translation}`,

  cardAnsweredKnew: (word: string, translation: string): string =>
    `${word} — ${translation}\n\n✓ Знал`,

  cardAnsweredNope: (word: string, translation: string): string =>
    `${word} — ${translation}\n\n✗ Не знал — повторим завтра.`,

  buttonReveal: 'Показать перевод',
  buttonKnew: '✓ Знал',
  buttonNope: '✗ Не знал',

  // Morning self-check: typed reverse-recall of the student's own new word.
  recallPrompt: (translation: string): string =>
    [`Проверим твоё слово 📝`, `Напиши по-английски:`, '', `«${translation}»`].join('\n'),

  recallCorrect: (word: string, translation: string): string =>
    `✓ Верно: ${word} — ${translation}`,

  recallWrong: (word: string, translation: string): string =>
    `✗ Правильно: ${word} — ${translation}. Повторим завтра.`,

  cardNotFound: 'Карточка не найдена — может, её уже удалили.',
  notYourCard: 'Эта карточка не твоя.',

  sessionLimitReached: (size: number): string =>
    `Сессия из ${size} ${pluralCard(size)} закончилась. Если ещё есть силы — /review.`,
};

/** Returns whole minutes (rounded up), formatted with Russian plural. */
function formatMinutes(cardCount: number): string {
  const totalSeconds = cardCount * globalConfig.spacedRepetition.secondsPerCard;
  const minutes = Math.max(1, Math.ceil(totalSeconds / 60));
  return `${minutes} ${pluralMin(minutes)}`;
}

function pluralCard(n: number): string {
  const last = n % 10;
  const tens = Math.floor(n / 10) % 10;
  if (tens === 1) return 'карточек';
  if (last === 1) return 'карточка';
  if (last >= 2 && last <= 4) return 'карточки';
  return 'карточек';
}

function pluralMin(n: number): string {
  const last = n % 10;
  const tens = Math.floor(n / 10) % 10;
  if (tens === 1) return 'минут';
  if (last === 1) return 'минута';
  if (last >= 2 && last <= 4) return 'минуты';
  return 'минут';
}
