import type Anthropic from '@anthropic-ai/sdk';
import { CefrLevel } from '../words/word.enums';

export const ENRICH_TOOL_NAME = 'enriched_words';

export interface EnrichedWord {
  lemma: string;
  translation: string;
  examples: string[];
  cefr: CefrLevel;
  forms: string[];
  gap_sentences: Array<{ sentence: string; hint: string }>;
  distractors: string[];
}

export const ENRICH_TOOL: Anthropic.Tool = {
  name: ENRICH_TOOL_NAME,
  description: 'Справочные данные по списку английских слов.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      words: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            lemma: { type: 'string', description: 'Ровно как в запросе' },
            translation: {
              type: 'string',
              description: 'Короткий перевод на русский, 1–3 варианта через запятую',
            },
            examples: {
              type: 'array',
              items: { type: 'string' },
              description: '2 простых английских предложения',
            },
            cefr: { type: 'string', enum: Object.values(CefrLevel) },
            forms: {
              type: 'array',
              items: { type: 'string' },
              description: 'Словоформы: run, runs, ran, running',
            },
            gap_sentences: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  sentence: { type: 'string', description: 'Предложение с ___ вместо слова' },
                  hint: {
                    type: 'string',
                    description: 'Подсказка по-русски в скобках, например (откладывать)',
                  },
                },
                required: ['sentence', 'hint'],
                additionalProperties: false,
              },
              description: '2 предложения с пропуском для карточек',
            },
            distractors: {
              type: 'array',
              items: { type: 'string' },
              description: '3 неверных русских перевода той же части речи',
            },
          },
          required: [
            'lemma',
            'translation',
            'examples',
            'cefr',
            'forms',
            'gap_sentences',
            'distractors',
          ],
          additionalProperties: false,
        },
      },
    },
    required: ['words'],
    additionalProperties: false,
  },
};

export const ENRICH_SYSTEM_PROMPT = `Ты составляешь справочник слов для школы английского. На вход — список английских слов и фраз (леммы). Для каждой верни перевод на русский, два простых примера, уровень CEFR, словоформы, два предложения с пропуском ___ и подсказкой по-русски, и три правдоподобных, но неверных перевода (дистрактора) той же части речи.

Правила: примеры — бытовые, 8–14 слов, уровень не выше слова. Фразовые глаголы и выражения — как единицу («look forward to»). Если слово написано с опечаткой, переведи то, что явно имелось в виду, но lemma верни ровно как в запросе. Вызови инструмент ${ENRICH_TOOL_NAME} ровно один раз со всеми словами.`;
