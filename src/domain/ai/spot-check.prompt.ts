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
      evidence: {
        type: ['string', 'null'],
        description:
          'Дословный фрагмент отчёта студента (из report_text), который подтверждает или опровергает ответ; null, если в отчёте об этом ничего нет',
      },
    },
    required: ['verdict', 'reason', 'evidence'],
    additionalProperties: false,
  },
};

/** Stable — cached. */
export const SPOT_CHECK_SYSTEM_PROMPT = `Студент школы английского сдал отчёт об аудировании с пересказом. Позже ему задали лёгкий вопрос по содержанию того же выпуска. Тебе дают отчёт целиком (report_text), выделенный пересказ, вопрос и ответ студента. Оцени ответ:
- OK — в ответе есть хоть одна конкретная деталь (причина, событие, имя, число, вывод), которая согласуется с отчётом или правдоподобна для такого выпуска. Пересказ своими словами, другими словами, чем в отчёте, по-русски или с ошибками — это OK; дословное совпадение не нужно. Если ответ на вопрос прямо есть в отчёте и студент назвал его по смыслу — OK.
- VAGUE — только общие слова, которые подошли бы к любому выпуску («было интересно», «про жизнь», «он много говорил»), либо ответ не о том, о чём спросили.
- WRONG — ответ прямо противоречит отчёту.
Язык ответа и грамматика не важны. В evidence верни дословный фрагмент report_text, на который ты опираешься (подтверждающий или противоречащий); если такого нет — null. Вызови инструмент ${SPOT_CHECK_TOOL_NAME} ровно один раз.`;
