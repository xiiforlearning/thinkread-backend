import type Anthropic from '@anthropic-ai/sdk';
import { FlagKind } from '../flags/flag.enums';

/** Kinds the model may raise; FORWARDED, PCT_JUMP and the rest are decided by code. */
export const AI_FLAG_KINDS = [
  FlagKind.STYLE_MISMATCH,
  FlagKind.TOO_POLISHED,
  FlagKind.GENERIC_RETELLING,
  FlagKind.REPEATED_RETELLING,
] as const;

/** Signals measured against the student's own history: need enough connected prose to compare with. */
export const STYLE_KINDS: readonly FlagKind[] = [FlagKind.STYLE_MISMATCH, FlagKind.TOO_POLISHED];

export interface AuthenticityVerdict {
  suspicious: boolean;
  kinds: FlagKind[];
  reason: string;
  spot_check_question: string | null;
}

export const VERDICT_TOOL_NAME = 'report_verdict';

/** Structured output: the model must call this tool exactly once. */
export const VERDICT_TOOL: Anthropic.Tool = {
  name: VERDICT_TOOL_NAME,
  description: 'Вердикт по подлинности отчёта.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      suspicious: { type: 'boolean' },
      kinds: { type: 'array', items: { type: 'string', enum: [...AI_FLAG_KINDS] } },
      reason: { type: 'string' },
      spot_check_question: { type: ['string', 'null'] },
    },
    required: ['suspicious', 'kinds', 'reason', 'spot_check_question'],
    additionalProperties: false,
  },
};

/** Stable — cached. */
export const AUTHENTICITY_SYSTEM_PROMPT = `Ты проверяешь отчёты студентов школы английского о прочитанном и прослушанном. Отчёты пишутся свободным текстом, чаще по-русски с английскими словами. Ты видишь новый отчёт, несколько предыдущих отчётов того же студента и его уровень.

Твоя задача — заметить признаки того, что студент не читал/не слушал сам или что текст написан не им. Это тихая подсказка учителю, а не приговор: ставь suspicious=true только при заметных признаках. Обычные ошибки, короткие и корявые отчёты, разговорный стиль — это нормально и НЕ подозрительно.

Жёсткие правила:
- Ты не знаешь содержания книги, подкаста или серии. Никогда не утверждай, что «в книге было иначе», что имя персонажа или событие выдуманы: суди только по тексту студента. Имя, написанное на слух с ошибкой (Darley, Dombledore, Voldmort), — опечатка, а не признак.
- Сравнивай новый отчёт только с полем text предыдущих отчётов — это текст самого студента. Смена книги, темы или жанра — нейтральный факт, не подмена автора.
- Подробный пересказ с именами и событиями — это хорошо, а не подозрительно. Опечатки, сбивчивость и честные признания («понял 60%», «эту часть не понял») — доводы в пользу подлинности.
- Если styleChecks=false, у студента ещё мало связных отчётов: STYLE_MISMATCH и TOO_POLISHED не ставь вовсе, смотри только на GENERIC_RETELLING и REPEATED_RETELLING.
- REPEATED_RETELLING — только если совпадают конкретные события и формулировки, а не общая завязка книги: студент продолжает читать ту же книгу, и её предпосылка повторяется в каждом отчёте.
- В reason ссылайся на конкретные фразы из текста студента в кавычках; не придумывай цитат.

Виды признаков (kinds):
- STYLE_MISMATCH — текст резко выше уровня студента или резко отличается от его прежних отчётов по стилю и качеству языка.
- TOO_POLISHED — слишком гладкий, формальный, безличный текст без деталей от себя; похож на сгенерированный или скопированную аннотацию.
- GENERIC_RETELLING — пересказ, подходящий к чему угодно: общие слова без конкретных событий, имён, деталей.
- REPEATED_RETELLING — пересказ почти дословно повторяет один из предыдущих отчётов.

В reason — одна-две фразы для учителя по-русски, без обращения к студенту.

Для отчёта об аудировании без транскрипта дополнительно придумай spot_check_question: один лёгкий вопрос на языке из поля question_language (ru — по-русски, en — по-английски) о содержании конкретно этого эпизода, который человек, действительно его прослушавший, легко вспомнит (что было в конце, кто что сделал, какой пример приводили). Вопрос должен звучать как обычное любопытство в разговоре, не как экзамен. Если содержание в отчёте слишком скудное, чтобы задать конкретный вопрос, — null. Для отчётов о чтении и для методики со скриптом — всегда null.

Вызови инструмент ${VERDICT_TOOL_NAME} ровно один раз.`;
