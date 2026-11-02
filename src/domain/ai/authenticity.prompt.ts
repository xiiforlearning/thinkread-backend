import type Anthropic from '@anthropic-ai/sdk';
import { FlagKind } from '../flags/flag.enums';

/** Content signals the model may report; each needs a quote the code can find in the text. */
export const CONTENT_KINDS = [FlagKind.GENERIC_RETELLING, FlagKind.REPEATED_RETELLING] as const;

/** Signals measured by code from the model's cited evidence and the student's own history. */
export const STYLE_KINDS: readonly FlagKind[] = [FlagKind.STYLE_MISMATCH, FlagKind.TOO_POLISHED];

/** Kept for the skills registry: every kind the check can raise from the model's evidence. */
export const AI_FLAG_KINDS = [...CONTENT_KINDS, ...STYLE_KINDS] as const;

export interface CitedFinding {
  kind: (typeof CONTENT_KINDS)[number];
  /** One sentence for the teacher, in Russian. */
  statement: string;
  /** Exact fragment of the new report the statement rests on. */
  quote: string;
  /** REPEATED_RETELLING: the matching fragment of the earlier report. */
  previous_quote: string | null;
}

export interface CitedFragment {
  /** Exact fragment of the new report's prose (up to ~8 words). */
  quote: string;
  /** What is wrong / what makes it above level — a few words. */
  note: string;
}

/**
 * The model reports evidence, not verdicts: cited content findings, the language slips it
 * sees and the fragments above the student's level. Code verifies every quote against the
 * text and decides the flags from counts and the student's history.
 */
export interface AuthenticityEvidence {
  findings: CitedFinding[];
  errors: CitedFragment[];
  advanced: CitedFragment[];
  spot_check_question: string | null;
}

export const VERDICT_TOOL_NAME = 'report_evidence';

export const VERDICT_TOOL: Anthropic.Tool = {
  name: VERDICT_TOOL_NAME,
  description: 'Наблюдения по отчёту студента с точными цитатами из его текста.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      findings: {
        type: 'array',
        description:
          'Содержательные признаки. Только с цитатой из нового отчёта; для REPEATED_RETELLING ещё и цитата из предыдущего отчёта.',
        items: {
          type: 'object',
          properties: {
            kind: { type: 'string', enum: [...CONTENT_KINDS] },
            statement: { type: 'string', description: 'Одно предложение для учителя по-русски' },
            quote: { type: 'string', description: 'Точный фрагмент нового отчёта' },
            previous_quote: {
              type: ['string', 'null'],
              description: 'Точный фрагмент предыдущего отчёта (для REPEATED_RETELLING)',
            },
          },
          required: ['kind', 'statement', 'quote', 'previous_quote'],
          additionalProperties: false,
        },
      },
      errors: {
        type: 'array',
        description:
          'Все орфографические, грамматические и лексические ошибки в связном тексте нового отчёта (не в списке слов): точный фрагмент до ~8 слов и что не так.',
        items: {
          type: 'object',
          properties: {
            quote: { type: 'string' },
            note: { type: 'string' },
          },
          required: ['quote', 'note'],
          additionalProperties: false,
        },
      },
      advanced: {
        type: 'array',
        description:
          'Фрагменты, заметно превышающие уровень студента (конструкции, лексика), которых нет в его предыдущих отчётах: точный фрагмент и почему.',
        items: {
          type: 'object',
          properties: {
            quote: { type: 'string' },
            note: { type: 'string' },
          },
          required: ['quote', 'note'],
          additionalProperties: false,
        },
      },
      spot_check_question: { type: ['string', 'null'] },
    },
    required: ['findings', 'errors', 'advanced', 'spot_check_question'],
    additionalProperties: false,
  },
};

/** Stable — cached. */
export const AUTHENTICITY_SYSTEM_PROMPT = `Ты помогаешь учителю школы английского проверять отчёты студентов о прочитанном и прослушанном. Отчёты пишутся свободным текстом, по-английски или по-русски с английскими словами. Ты видишь новый отчёт (поле text — текст самого студента), несколько его предыдущих отчётов (тоже только его текст) и его уровень.

Ты не выносишь вердикт. Ты собираешь наблюдения с точными цитатами, а решение принимает программа по цифрам и истории студента. Каждая цитата проверяется по тексту автоматически: цитата, которой нет в тексте, отбрасывается вместе с утверждением. Поэтому цитируй дословно, включая ошибки студента, и не придумывай.

Жёсткие правила:
- Ты не знаешь содержания книги, подкаста или серии. Никогда не утверждай, что «в книге было иначе», что имя или событие выдуманы. Имя, написанное на слух с ошибкой (Darley, Dombledore, Voldmort), — опечатка, а не признак.
- Сравнивай новый отчёт только с текстами предыдущих отчётов студента. Смена книги, темы или жанра — нейтральный факт.
- Подробный пересказ с именами и событиями — хорошо, не подозрительно. Опечатки, сбивчивость и честные признания («понял 60%») — доводы в пользу подлинности, их не нужно «объяснять».

Что собирать:
1. findings — содержательные признаки, только два вида:
   - GENERIC_RETELLING: пересказ подошёл бы к любой книге или серии — одни общие слова, ничего, что связывает его с названным источником. Признака нет, если есть хотя бы одно имя персонажа или места, конкретный термин, конкретное событие или сцена, а для нон-фикшн — конкретная мысль, совет или пример автора. Краткость, простой язык и честные признания («понял 60%») — не признак. Цитируй самую общую фразу.
   - REPEATED_RETELLING: тот же источник (та же книга, подкаст или сериал по названию), и новый отчёт пересказывает те же события теми же формулировками, что один из предыдущих, хотя заявлены новые страницы или другая серия. Нужны две цитаты: из нового и из предыдущего. Не признак: другая книга с похожим сюжетом; общая завязка, которая повторяется в каждом отчёте; напоминание прошлого эпизода, после которого идут события, которых в предыдущем отчёте не было.
2. errors — все ошибки в связном тексте нового отчёта: орфография (seas вместо sees), грамматика (he don't go), выбор слова, пунктуация, которая мешает читать. Каждую отдельно, цитата до ~8 слов ровно как в тексте. Список новых слов студента не проверяй. Если ошибок нет — пустой массив.
3. advanced — фрагменты нового отчёта, которые заметно выше уровня студента и не встречались в его предыдущих отчётах: сложные конструкции, редкая лексика, идиомы. Только то, что реально выделяется; для Advanced-студента сложная фраза — норма.

Для отчёта об аудировании без транскрипта дополнительно придумай spot_check_question: один лёгкий вопрос на языке из поля question_language (ru — по-русски, en — по-английски) о содержании конкретно этого эпизода, который человек, действительно его прослушавший, легко вспомнит. Вопрос должен звучать как обычное любопытство, не как экзамен. Если содержание слишком скудное — null. Для чтения и для методики со скриптом — всегда null.

Вызови инструмент ${VERDICT_TOOL_NAME} ровно один раз.`;
