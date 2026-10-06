import type Anthropic from '@anthropic-ai/sdk';
import { AiPurpose } from '../ai-log/ai-usage.entity';
import { AUTHENTICITY_SYSTEM_PROMPT, VERDICT_TOOL } from './authenticity.prompt';
import { ENRICH_SYSTEM_PROMPT, ENRICH_TOOL } from './enrichment.prompt';
import { PARENT_REPORT_SYSTEM_PROMPT, PARENT_REPORT_TOOL } from './parent-report.prompt';
import { PARSE_SYSTEM_PROMPT, parseTool } from './report-intake.prompt';
import { SENTENCE_SYSTEM_PROMPT, SENTENCE_TOOL } from './sentence-check.prompt';
import {
  enrich,
  fillSchema,
  gradeSentence,
  gradeSpotCheck,
  type JsonSchema,
  parentReport,
  parseListening,
  parseReading,
  schemaProps,
  teacherReply,
  verdict,
} from './simulate';
import { SPOT_CHECK_SYSTEM_PROMPT, SPOT_CHECK_TOOL } from './spot-check.prompt';
import { TEACHER_CHAT_SYSTEM_PROMPT, TEACHER_REPLY_TOOL } from './teacher-chat.prompt';

/**
 * An AI skill = one job the product gives the model: a cached system prompt,
 * one forced tool (structured output) and a rule-based simulator used when
 * no model is available. Services build their LlmRequest from these; the
 * fake adapter and `pnpm ai:skill` look skills up here.
 */
export interface AiSkill {
  /** Stable id, used by `pnpm ai:skill <name>`. */
  name: string;
  title: string;
  purpose: AiPurpose;
  /** Who calls it and when. */
  description: string;
  system: string;
  tool: Anthropic.Tool;
  /** What the user turn looks like (for docs and the CLI runner). */
  example: string;
  simulate: (text: string) => Record<string, unknown>;
}

export const AI_SKILLS: AiSkill[] = [
  {
    name: 'parse_reading_report',
    title: 'Разбор отчёта о чтении',
    purpose: AiPurpose.DIALOG,
    description:
      'ReportIntakeService.submit: свободный текст студента → книга, страницы, о чём, новые слова. Ничего не додумывает, недостающее = null.',
    system: PARSE_SYSTEM_PROMPT.READING,
    tool: parseTool('READING'),
    example:
      'прочитал 15 страниц Harry Potter and the Philosopher’s Stone, про то как он узнал что волшебник, слова: wand, muggle',
    simulate: parseReading,
  },
  {
    name: 'parse_listening_report',
    title: 'Разбор отчёта об аудировании',
    purpose: AiPurpose.DIALOG,
    description:
      'ReportIntakeService.submit: подкаст/сериал, % с первого и после, сколько раз, пересказ дословно, непонятное, слова. Недостающие поля → один уточняющий вопрос.',
    system: PARSE_SYSTEM_PROMPT.LISTENING,
    tool: parseTool('LISTENING'),
    example:
      'слушал 6 Minute English про сон, с первого раза 70%, после третьего 88%, слушал 3 раза. The episode was about why we sleep. слова: drowsy, nap',
    simulate: parseListening,
  },
  {
    name: 'enrich_words',
    title: 'Обогащение слов',
    purpose: AiPurpose.ENRICH_WORDS,
    description:
      'EnrichmentService: для списка лемм — перевод, примеры, CEFR, словоформы, предложения с пропуском для карточек, дистракторы. Один раз на лемму, в word_lexicon.',
    system: ENRICH_SYSTEM_PROMPT,
    tool: ENRICH_TOOL,
    example: '{"lemmas":["postpone","resilient","look forward to"]}',
    simulate: (text) => ({ words: enrich(text) }),
  },
  {
    name: 'authenticity',
    title: 'Подлинность отчёта',
    purpose: AiPurpose.AUTHENTICITY,
    description:
      'AuthenticityService.checkLater после сохранения: стилевые признаки (STYLE_MISMATCH, TOO_POLISHED, GENERIC_RETELLING, REPEATED_RETELLING) и точечный вопрос для аудирования без транскрипта. Тихий флаг учителю.',
    system: AUTHENTICITY_SYSTEM_PROMPT,
    tool: VERDICT_TOOL,
    example:
      'Уровень студента: Upper-Intermediate, метод: подкаст без транскрипта.\nНовый отчёт: слушал 6 Minute English про сон, 70% → 88%. The episode was about why we sleep. The hosts said a nap helps memory.\nПредыдущие отчёты: …',
    simulate: verdict,
  },
  {
    name: 'spot_check_grade',
    title: 'Оценка точечного вопроса',
    purpose: AiPurpose.AUTHENTICITY,
    description:
      'SpotCheckGraderService.answer: ответ студента на вопрос по содержанию против его пересказа → OK / VAGUE / WRONG. Вердикт студенту не показывается.',
    system: SPOT_CHECK_SYSTEM_PROMPT,
    tool: SPOT_CHECK_TOOL,
    example:
      'Пересказ из отчёта: The episode was about why we sleep…\nВопрос: Чем закончился выпуск?\nОтвет студента: They said a short nap before 3 pm is fine.',
    simulate: gradeSpotCheck,
  },
  {
    name: 'sentence_check',
    title: 'Проверка предложения (карточки, стадия 3)',
    purpose: AiPurpose.SENTENCE_CHECK,
    description:
      'SentenceCheckService.check: употреблено ли слово по смыслу (ok) и одна мягкая подсказка по грамматике (feedback). Сбой модели = ответ засчитан.',
    system: SENTENCE_SYSTEM_PROMPT,
    tool: SENTENCE_TOOL,
    example:
      '{"word":"postpone","translation":"откладывать","sentence":"i had to postpone my trip because of the rain"}',
    simulate: gradeSentence,
  },
  {
    name: 'teacher_chat',
    title: 'Чат учителя о студенте',
    purpose: AiPurpose.TEACHER_CHAT,
    description:
      'TeacherChatService.ask (дашборд): вопрос учителя + блок facts, посчитанный системой → короткий ответ по фактам или черновик обратной связи (draft). Студент ничего не видит.',
    system: TEACHER_CHAT_SYSTEM_PROMPT,
    tool: TEACHER_REPLY_TOOL,
    example:
      '{"facts":{"student":{"name":"Акмаль Хадиев","firstName":"Акмаль","silentDays":0,"health":"good"},"norms":{"readingPerWeek":3,"listeningPerWeek":3,"cardsPerDay":5},"period":{"label":"последние 4 нед."},"weeksMet":{"reading":3,"listening":1,"of":4},"totals":{"reports":14,"reading":10,"listening":4,"pages":180,"sources":["Harry Potter"]},"vocabulary":{"total":42,"learned":9,"addedInPeriod":38,"learnedInPeriod":9},"stuckWords":[{"word":"resourceful","stage":2,"daysInLearning":31}],"flags":[]},"history":[],"question":"Что даётся хуже?"}',
    simulate: teacherReply,
  },
  {
    name: 'parent_report',
    title: 'Отчёт родителям за месяц',
    purpose: AiPurpose.PARENT_REPORT,
    description:
      'TeacherChatService.parentReport (дашборд, кнопка «Отчёт родителям»): факты за месяц → 4–7 предложений по-русски, без флагов и оценок. Учитель проверяет и пересылает сам.',
    system: PARENT_REPORT_SYSTEM_PROMPT,
    tool: PARENT_REPORT_TOOL,
    example:
      '{"facts":{"student":{"name":"Акмаль Хадиев"},"period":{"label":"сентябрь 2026"},"weeksMet":{"reading":3,"listening":2,"of":4},"totals":{"reports":15,"reading":9,"listening":6,"pages":180,"sources":["Harry Potter and the Philosopher’s Stone"]},"vocabulary":{"total":42,"learned":9,"addedInPeriod":38,"learnedInPeriod":9}}}',
    simulate: parentReport,
  },
];

export function skillByName(name: string): AiSkill | undefined {
  return AI_SKILLS.find((s) => s.name === name);
}

/** The skill behind a forced tool call (parsed_report is two skills — told apart by the schema). */
export function skillByTool(tool: Anthropic.Tool): AiSkill | undefined {
  if (tool.name === 'parsed_report') {
    return skillByName(
      'book_title' in schemaProps(tool) ? 'parse_reading_report' : 'parse_listening_report',
    );
  }
  return AI_SKILLS.find((s) => s.tool.name === tool.name);
}

/** Simulated output for a forced tool: the skill's simulator, or a schema-shaped blank. */
export function simulateTool(tool: Anthropic.Tool, text: string): Record<string, unknown> {
  const skill = skillByTool(tool);
  return skill ? skill.simulate(text) : fillSchema(tool.input_schema as JsonSchema);
}
