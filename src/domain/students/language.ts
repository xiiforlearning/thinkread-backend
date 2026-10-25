import { StudentLanguage } from './student.enums';

/** Language of everything the student reads: Mini App texts come from the frontend, bot and API texts from here. */
export type Lang = 'ru' | 'en';

/**
 * Decision 25.10.2026: the product speaks English to every student, with no switch. The Russian
 * texts and `students.language` stay in place; set `DEFAULT_LANG` back to 'ru' (and show the
 * switch in the Mini App) to reopen the choice.
 */
export const DEFAULT_LANG: Lang = 'en';

/** The student's language: the stored choice when there is one, otherwise the product default. */
export function langOf(student: { language: StudentLanguage | null } | null | undefined): Lang {
  if (student?.language === StudentLanguage.EN) return 'en';
  if (student?.language === StudentLanguage.RU) return 'ru';
  return DEFAULT_LANG;
}

/**
 * Telegram's `language_code` → interface language. Unused while the product is English-only;
 * kept so a later default-by-Telegram needs one call site change in `RegistrationService`.
 */
export function langFromTelegram(code: string | null | undefined): StudentLanguage {
  return (code ?? '').toLowerCase().startsWith('en') ? StudentLanguage.EN : StudentLanguage.RU;
}

/** English plural: pluralEn(3, 'word', 'words') → 'words'. */
export function pluralEn(n: number, one: string, many: string): string {
  return Math.abs(n) === 1 ? one : many;
}
