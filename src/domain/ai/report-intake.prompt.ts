import type Anthropic from '@anthropic-ai/sdk';

export const PARSE_TOOL_NAME = 'parsed_report';

export interface ParsedReading {
  kind: 'READING';
  book_title: string | null;
  pages: number | null;
  summary: string | null;
  new_words: string[];
}

export interface ParsedListening {
  kind: 'LISTENING';
  source_title: string | null;
  episode: string | null;
  first_pass_pct: number | null;
  second_pass_pct: number | null;
  listen_count: number | null;
  retelling: string | null;
  unclear_parts: string[];
  new_words: string[];
}

export type ParsedReport = ParsedReading | ParsedListening;

const READING_SCHEMA: Anthropic.Tool.InputSchema = {
  type: 'object',
  properties: {
    book_title: { type: ['string', 'null'], description: 'Название книги (и автор, если назван)' },
    pages: { type: ['integer', 'null'], description: 'Сколько страниц прочитано' },
    summary: { type: ['string', 'null'], description: 'О чём прочитанное — словами студента' },
    new_words: {
      type: 'array',
      items: { type: 'string' },
      description: 'Новые английские слова и фразы',
    },
  },
  required: ['book_title', 'pages', 'summary', 'new_words'],
  additionalProperties: false,
};

const LISTENING_SCHEMA: Anthropic.Tool.InputSchema = {
  type: 'object',
  properties: {
    source_title: { type: ['string', 'null'], description: 'Подкаст / сериал' },
    episode: { type: ['string', 'null'], description: 'Эпизод, серия или сцена' },
    first_pass_pct: { type: ['integer', 'null'], description: '% понимания с первого раза, 0–100' },
    second_pass_pct: {
      type: ['integer', 'null'],
      description: '% понимания после повторного прослушивания',
    },
    listen_count: { type: ['integer', 'null'], description: 'Сколько раз слушал/смотрел' },
    retelling: {
      type: ['string', 'null'],
      description: 'Пересказ содержания словами студента, дословно',
    },
    unclear_parts: { type: 'array', items: { type: 'string' } },
    new_words: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'source_title',
    'episode',
    'first_pass_pct',
    'second_pass_pct',
    'listen_count',
    'retelling',
    'unclear_parts',
    'new_words',
  ],
  additionalProperties: false,
};

export function parseTool(kind: 'READING' | 'LISTENING'): Anthropic.Tool {
  return {
    name: PARSE_TOOL_NAME,
    description: 'Структурированные поля отчёта студента.',
    strict: true,
    input_schema: kind === 'READING' ? READING_SCHEMA : LISTENING_SCHEMA,
  };
}

/** Stable per kind — cached. */
export const PARSE_SYSTEM_PROMPT: Record<'READING' | 'LISTENING', string> = {
  READING: `Ты извлекаешь поля из отчёта студента о прочитанном (школа английского, отчёты по-русски с английскими словами). Верни ровно то, что студент написал: ничего не додумывай, недостающее — null. Проценты и числа — только если названы явно («половину» = 50). summary — его описание содержания, без твоих добавлений. new_words — английские слова и фразы, по одному, без переводов. Вызови инструмент ${PARSE_TOOL_NAME} ровно один раз.`,
  LISTENING: `Ты извлекаешь поля из отчёта студента об аудировании (подкаст или сериал; школа английского, отчёты по-русски с английскими словами). Верни ровно то, что студент написал: ничего не додумывай, недостающее — null. Проценты — только если названы явно («половину» = 50, «почти всё» — null). retelling — его пересказ содержания дословно (на любом языке), а не название. new_words — английские слова и фразы, по одному, без переводов. Вызови инструмент ${PARSE_TOOL_NAME} ровно один раз.`,
};
