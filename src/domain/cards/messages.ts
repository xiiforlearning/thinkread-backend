import { Lang } from '../students/language';
import { CardStage } from '../words/word.enums';

/** What the student sees on a card and after answering it. */
export interface CardTexts {
  stageLabel: Record<CardStage, string>;
  question: Record<CardStage, string>;
  /** Stage 1 without a translation to show: ask for the word by its masked example. */
  questionNoTranslation: string;
  placeholder: Record<CardStage, string>;
  right: (stage: CardStage, word: string, learned: boolean) => string;
  wrong: (
    stage: CardStage,
    word: string,
    translation: string | null,
    example: string | null,
  ) => string;
  tooShort: string;
  missingWord: (word: string) => string;
}

const ru: CardTexts = {
  stageLabel: {
    [CardStage.TRANSLATION]: 'перевод',
    [CardStage.GAP]: 'в предложении',
    [CardStage.OWN_SENTENCE]: 'своё предложение',
  },

  question: {
    [CardStage.TRANSLATION]: 'Переведи на английский',
    [CardStage.GAP]: 'Впиши пропущенное слово',
    [CardStage.OWN_SENTENCE]: 'Составь предложение со словом',
  },
  questionNoTranslation: 'Напиши это слово по-английски',

  placeholder: {
    [CardStage.TRANSLATION]: 'Напиши по-английски',
    [CardStage.GAP]: 'Впиши слово',
    [CardStage.OWN_SENTENCE]: 'Напиши предложение',
  },

  right: (stage, word, learned) => {
    if (learned) return `Отлично, слово употреблено по смыслу — ${word} уходит в выученные.`;
    if (stage === CardStage.TRANSLATION)
      return `Точно, ${word}. Слово переходит на стадию 2 — в следующий раз встретимся с ним в предложении.`;
    if (stage === CardStage.GAP)
      return `Да, ${word}. Слово сидит — в следующий раз попросим составить с ним своё предложение.`;
    return `Хорошо, ${word} употреблено по смыслу.`;
  },

  wrong: (stage, word, translation, example) => {
    if (stage === CardStage.OWN_SENTENCE) {
      const meaning = translation ? ` — «${translation}»` : '';
      const sample = example ? `: “${example}”` : '';
      return `Похоже, слово употреблено не совсем по смыслу. ${word}${meaning}${sample}. Попробуем в другой раз.`;
    }
    return `Правильный ответ: ${word}. Ничего страшного, вернёмся к нему завтра.`;
  },

  tooShort: 'Нужно целое предложение — хотя бы три слова с этим словом внутри.',
  missingWord: (word) => `В предложении должно быть само слово — ${word}.`,
};

const en: CardTexts = {
  stageLabel: {
    [CardStage.TRANSLATION]: 'translation',
    [CardStage.GAP]: 'in a sentence',
    [CardStage.OWN_SENTENCE]: 'your own sentence',
  },

  question: {
    [CardStage.TRANSLATION]: 'Translate into English',
    [CardStage.GAP]: 'Fill in the missing word',
    [CardStage.OWN_SENTENCE]: 'Make a sentence with the word',
  },
  questionNoTranslation: 'Write this word in English',

  placeholder: {
    [CardStage.TRANSLATION]: 'Write it in English',
    [CardStage.GAP]: 'Type the word',
    [CardStage.OWN_SENTENCE]: 'Write a sentence',
  },

  right: (stage, word, learned) => {
    if (learned) return `Great, the word is used correctly — ${word} goes to learned.`;
    if (stage === CardStage.TRANSLATION)
      return `Exactly, ${word}. The word moves to stage 2 — next time you'll meet it in a sentence.`;
    if (stage === CardStage.GAP)
      return `Yes, ${word}. It sticks — next time we'll ask you to make your own sentence with it.`;
    return `Good, ${word} is used correctly.`;
  },

  wrong: (stage, word, translation, example) => {
    if (stage === CardStage.OWN_SENTENCE) {
      const meaning = translation ? ` — "${translation}"` : '';
      const sample = example ? `: “${example}”` : '';
      return `The word doesn't quite fit its meaning here. ${word}${meaning}${sample}. We'll try again another time.`;
    }
    return `The right answer: ${word}. No worries, we'll come back to it tomorrow.`;
  },

  tooShort: 'A whole sentence is needed — at least three words with this word inside.',
  missingWord: (word) => `The sentence must contain the word itself — ${word}.`,
};

export const cardTexts: Record<Lang, CardTexts> = { ru, en };

/** Card texts in the student's language. */
export function cardMessagesFor(lang: Lang): CardTexts {
  return cardTexts[lang];
}
