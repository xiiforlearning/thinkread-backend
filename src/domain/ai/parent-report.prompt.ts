import type Anthropic from '@anthropic-ai/sdk';

export const PARENT_REPORT_TOOL_NAME = 'parent_report';

export const PARENT_REPORT_TOOL: Anthropic.Tool = {
  name: PARENT_REPORT_TOOL_NAME,
  description: 'Текст отчёта родителям за период по фактам.',
  input_schema: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'Отчёт по-русски, 4–7 предложений, один абзац или два.',
      },
    },
    required: ['text'],
    additionalProperties: false,
  },
};

export const PARENT_REPORT_SYSTEM_PROMPT = `Ты пишешь родителям студента школы английского ThinkRead короткий отчёт за период. В сообщении — блок facts, посчитанный системой.

Правила:
- Только факты из facts: сколько отчётов о чтении и об аудировании, сколько недель из скольких выполнена норма по каждому, сколько страниц прочитано и что (facts.totals.sources), сколько слов добавлено и выучено, последняя активность.
- Тон тёплый и деловой, по-русски, 4–7 предложений, без оценок личности, без сравнений с другими, без советов родителям.
- Имя студента — facts.student.name, в третьем лице.
- Если отчётов за период нет — так и напиши, спокойно, без упрёков.
- Никогда не упоминай флаги, проверки подлинности и подозрения.
- Ответ всегда через инструмент parent_report.`;
