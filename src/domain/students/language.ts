import { StudentLanguage } from './student.enums';

/** Language of everything the student reads: Mini App texts come from the frontend, bot and API texts from here. */
export type Lang = 'ru' | 'en';

export const DEFAULT_LANG: Lang = 'ru';

/** The student's chosen language, Russian when nothing is chosen (or there is no student). */
export function langOf(student: { language: StudentLanguage | null } | null | undefined): Lang {
  return student?.language === StudentLanguage.EN ? 'en' : DEFAULT_LANG;
}

/**
 * Telegram's `language_code` → interface language. Only an English Telegram gets English; the
 * school's students are Russian-speaking, so every other code (ru, uz, …) means Russian.
 */
export function langFromTelegram(code: string | null | undefined): StudentLanguage {
  return (code ?? '').toLowerCase().startsWith('en') ? StudentLanguage.EN : StudentLanguage.RU;
}

/** English plural: pluralEn(3, 'word', 'words') → 'words'. */
export function pluralEn(n: number, one: string, many: string): string {
  return Math.abs(n) === 1 ? one : many;
}
