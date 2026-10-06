import type Anthropic from '@anthropic-ai/sdk';

export const SENTENCE_TOOL_NAME = 'sentence_verdict';

export interface SentenceVerdict {
  /** The word is used in its meaning (grammar mistakes do not matter). */
  ok: boolean;
  /** One soft grammar hint in Russian, or null. Never blocks progress. */
  feedback: string | null;
}

export const SENTENCE_TOOL: Anthropic.Tool = {
  name: SENTENCE_TOOL_NAME,
  description: 'Оценка предложения студента со словом из карточки.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      ok: { type: 'boolean' },
      feedback: { type: ['string', 'null'] },
    },
    required: ['ok', 'feedback'],
    additionalProperties: false,
  },
};

/** Stable — cached. */
export const SENTENCE_SYSTEM_PROMPT = `Студент школы английского на третьей стадии карточки составил своё предложение с заданным словом. Оцени только одно: употреблено ли слово в своём значении (ok=true) или не по смыслу / как другая часть речи так, что смысл потерян (ok=false). Ошибки грамматики, артиклей, порядка слов, опечатки — не повод для ok=false.

Если видишь одну явную грамматическую ошибку, положи в feedback короткую дружелюбную подсказку по-русски в одну фразу (как «между делом»), иначе feedback=null. Не оценивай студента, не хвали, не объясняй правила длинно.

Вызови инструмент ${SENTENCE_TOOL_NAME} ровно один раз.`;
