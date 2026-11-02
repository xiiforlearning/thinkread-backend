import type Anthropic from '@anthropic-ai/sdk';
import { NEW_WORDS_DESCRIPTION } from './report-intake.prompt';

export const REPORT_WORDS_TOOL_NAME = 'report_words';

export interface ReportWordItem {
  word: string;
  /** The student's own translation, when written next to the word. */
  translation: string | null;
}

/**
 * The student's explicit list of new words, and nothing else: the dictionary is filled only
 * from the list the student wrote, never from the retelling (customer decision, 02.11.2026).
 */
export interface ReportWords {
  has_list: boolean;
  items: ReportWordItem[];
}

export const REPORT_WORDS_TOOL: Anthropic.Tool = {
  name: REPORT_WORDS_TOOL_NAME,
  description: 'Список новых слов, который студент сам выписал в отчёте.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      has_list: {
        type: 'boolean',
        description: 'В отчёте есть явный список слов (не слова внутри пересказа)',
      },
      items: {
        type: 'array',
        description: NEW_WORDS_DESCRIPTION,
        items: {
          type: 'object',
          properties: {
            word: { type: 'string', description: 'Слово или фраза в словарной форме' },
            translation: {
              type: ['string', 'null'],
              description: 'Перевод, который написал сам студент; иначе null',
            },
          },
          required: ['word', 'translation'],
          additionalProperties: false,
        },
      },
    },
    required: ['has_list', 'items'],
    additionalProperties: false,
  },
};

/** Stable — cached. */
export const REPORT_WORDS_SYSTEM_PROMPT = `Ты выписываешь из отчёта студента школы английского его список новых слов. Отчёт — свободный текст: пересказ прочитанного или прослушанного и, часто, список слов, которые студент выучил.

Список — это только то, что студент сам оформил как список: блок после заголовка вроде «New words», «Новые слова», «Vocabulary», «слова:», строки вида «word — перевод» или «word-перевод», колонка английских слов по одному на строку, перечисление через запятую после двоеточия. Заголовок не обязателен, если по форме это список.

Жёсткие правила:
- Из связного текста (пересказа) не бери ничего, даже редкие и трудные слова. Если списка нет — has_list=false и пустой items. Не придумывай список за студента.
- Слова — ровно те, что выписал студент, в словарной форме (${NEW_WORDS_DESCRIPTION}). Пропущенные буквы и явные опечатки исправляй (resemblence → resemblance), смысл не меняй.
- Имена собственные (людей, мест, названия книг и фильмов) в словарь не идут — пропускай.
- Перевод — только тот, что написал сам студент рядом со словом; не добавляй свой. Если на одной строке слиплись несколько пар («purpose — цель support-поддерживать»), разбей на отдельные пары.
- Нумерацию, маркеры, скобки с пометками (adj, B2) убирай. Дубликаты не повторяй.

Вызови инструмент ${REPORT_WORDS_TOOL_NAME} ровно один раз.`;
