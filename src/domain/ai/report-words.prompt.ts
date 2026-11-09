import type Anthropic from '@anthropic-ai/sdk';
import { NEW_WORDS_DESCRIPTION } from './report-intake.prompt';

export const REPORT_WORDS_TOOL_NAME = 'report_words';

export interface ReportWordItem {
  word: string;
  /** The student's own translation, when written next to the word. */
  translation: string | null;
  /** The sentence of the student's retelling where the word is used, verbatim; null if none. */
  context: string | null;
  /**
   * W6: when the student wrote no translation — the translation by the meaning the word has in
   * this report (the sentence it is used in, else the book / episode), never a dictionary-first
   * sense. Null when the student gave one.
   */
  suggested_translation: string | null;
  /** A1 vocabulary (uncle, family, night, big) — not added automatically. */
  basic: boolean;
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
            context: {
              type: ['string', 'null'],
              description:
                'Предложение из пересказа студента, где это слово употреблено, дословно; null, если в пересказе его нет',
            },
            suggested_translation: {
              type: ['string', 'null'],
              description:
                'Только если студент не написал перевод: перевод в том значении, в котором слово употреблено в этом отчёте (по context, иначе по теме книги/выпуска), 1–2 варианта через запятую; иначе null',
            },
            basic: {
              type: 'boolean',
              description:
                'Слово уровня A1 — самая базовая лексика (uncle, family, night, big, go)',
            },
          },
          required: ['word', 'translation', 'context', 'suggested_translation', 'basic'],
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
- translation — только то, что написал сам студент рядом со словом. Если на одной строке слиплись несколько пар («purpose — цель support-поддерживать»), разбей на отдельные пары.
- Если перевода у студента нет, дай suggested_translation по контексту отчёта: в каком значении слово стоит в пересказе (context) или о чём книга / выпуск. «will» в «his will to live» — «воля», а не «завещание»; «quote» в тексте про цитаты — «цитата», а не «смета». Словарное первое значение без оглядки на текст — ошибка.
- context — предложение пересказа, где слово употреблено, дословно и целиком (его проверит код); если слово только в списке — null.
- basic=true для лексики уровня A1 (uncle, family, night, big, go, house): такие слова студент подтверждает отдельно, автоматически они не добавляются.
- Нумерацию, маркеры, скобки с пометками (adj, B2) убирай. Дубликаты не повторяй.

Вызови инструмент ${REPORT_WORDS_TOOL_NAME} ровно один раз.`;
