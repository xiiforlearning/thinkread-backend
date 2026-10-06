import { CardStage } from '../words/word.enums';

/** What the student sees after answering a card. */
export const cardMessages = {
  stageLabel: {
    [CardStage.TRANSLATION]: 'перевод',
    [CardStage.GAP]: 'в предложении',
    [CardStage.OWN_SENTENCE]: 'своё предложение',
  } as Record<CardStage, string>,

  question: {
    [CardStage.TRANSLATION]: 'Переведи на английский',
    [CardStage.GAP]: 'Впиши пропущенное слово',
    [CardStage.OWN_SENTENCE]: 'Составь предложение со словом',
  } as Record<CardStage, string>,

  placeholder: {
    [CardStage.TRANSLATION]: 'Напиши по-английски',
    [CardStage.GAP]: 'Впиши слово',
    [CardStage.OWN_SENTENCE]: 'Напиши предложение',
  } as Record<CardStage, string>,

  right: (stage: CardStage, word: string, learned: boolean): string => {
    if (learned) return `Отлично, слово употреблено по смыслу — ${word} уходит в выученные.`;
    if (stage === CardStage.TRANSLATION)
      return `Точно, ${word}. Слово переходит на стадию 2 — в следующий раз встретимся с ним в предложении.`;
    if (stage === CardStage.GAP)
      return `Да, ${word}. Слово сидит — в следующий раз попросим составить с ним своё предложение.`;
    return `Хорошо, ${word} употреблено по смыслу.`;
  },

  wrong: (
    stage: CardStage,
    word: string,
    translation: string | null,
    example: string | null,
  ): string => {
    if (stage === CardStage.OWN_SENTENCE) {
      const meaning = translation ? ` — «${translation}»` : '';
      const sample = example ? `: “${example}”` : '';
      return `Похоже, слово употреблено не совсем по смыслу. ${word}${meaning}${sample}. Попробуем в другой раз.`;
    }
    return `Правильный ответ: ${word}. Ничего страшного, вернёмся к нему завтра.`;
  },

  tooShort: 'Нужно целое предложение — хотя бы три слова с этим словом внутри.',
  missingWord: (word: string): string => `В предложении должно быть само слово — ${word}.`,
};
