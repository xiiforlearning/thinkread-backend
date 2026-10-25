import { cardMessagesFor, cardTexts } from '../cards/messages';
import { reminderTexts } from '../notify/messages';
import { CardStage } from '../words/word.enums';
import { langFromTelegram, langOf } from './language';
import { studentTexts } from './messages';
import { StudentLanguage } from './student.enums';

describe('student language', () => {
  it('is Russian unless English was chosen', () => {
    expect(langOf(null)).toBe('ru');
    expect(langOf({ language: null })).toBe('ru');
    expect(langOf({ language: StudentLanguage.RU })).toBe('ru');
    expect(langOf({ language: StudentLanguage.EN })).toBe('en');
  });

  it('takes English only from an English Telegram', () => {
    expect(langFromTelegram('en')).toBe(StudentLanguage.EN);
    expect(langFromTelegram('en-US')).toBe(StudentLanguage.EN);
    expect(langFromTelegram('ru')).toBe(StudentLanguage.RU);
    expect(langFromTelegram('uz')).toBe(StudentLanguage.RU);
    expect(langFromTelegram(undefined)).toBe(StudentLanguage.RU);
  });

  it('every text exists in both languages', () => {
    expect(Object.keys(studentTexts.en).sort()).toEqual(Object.keys(studentTexts.ru).sort());
    expect(Object.keys(cardTexts.en).sort()).toEqual(Object.keys(cardTexts.ru).sort());
    expect(Object.keys(reminderTexts.en).sort()).toEqual(Object.keys(reminderTexts.ru).sort());
    for (const stage of [CardStage.TRANSLATION, CardStage.GAP, CardStage.OWN_SENTENCE]) {
      expect(cardTexts.en.question[stage]).toBeTruthy();
      expect(cardTexts.en.placeholder[stage]).toBeTruthy();
      expect(cardTexts.en.stageLabel[stage]).toBeTruthy();
    }
  });

  it('card feedback follows the language', () => {
    expect(cardMessagesFor('en').right(CardStage.TRANSLATION, 'owl', false)).toContain('stage 2');
    expect(cardMessagesFor('ru').right(CardStage.TRANSLATION, 'owl', false)).toContain('стадию 2');
    expect(cardMessagesFor('en').wrong(CardStage.GAP, 'owl', 'сова', null)).toBe(
      "The right answer: owl. No worries, we'll come back to it tomorrow.",
    );
    expect(
      reminderTexts.en.reports({ reading: 1, listening: 0 }, { reading: 3, listening: 3 }, 2),
    ).toBe(
      '2 days left in the week. Still to do: reading — 1 more of 3. Reports are handed in in the app — one message each.',
    );
  });
});
