import type Anthropic from '@anthropic-ai/sdk';
import { SpotCheckVerdict } from '../flags/flag.enums';

export const SPOT_CHECK_TOOL_NAME = 'spot_check_verdict';

export const SPOT_CHECK_TOOL: Anthropic.Tool = {
  name: SPOT_CHECK_TOOL_NAME,
  description: 'Оценка ответа студента на вопрос по прослушанному.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      verdict: {
        type: 'string',
        enum: [SpotCheckVerdict.OK, SpotCheckVerdict.VAGUE, SpotCheckVerdict.WRONG],
      },
      reason: { type: 'string' },
    },
    required: ['verdict', 'reason'],
    additionalProperties: false,
  },
};

/** Stable — cached. */
export const SPOT_CHECK_SYSTEM_PROMPT = `Студент школы английского сдал отчёт об аудировании с пересказом. Позже ему задали лёгкий вопрос по содержанию того же выпуска. Оцени его ответ: OK — конкретно и согласуется с пересказом или правдоподобно для такого выпуска; VAGUE — общие слова без конкретики; WRONG — противоречит пересказу. Язык ответа и ошибки не важны. Вызови инструмент ${SPOT_CHECK_TOOL_NAME} ровно один раз.`;
