import type Anthropic from '@anthropic-ai/sdk';
import { Injectable, Logger } from '@nestjs/common';
import { LlmPort, LlmRequest } from '../../domain/ai/llm.port';

/**
 * Deterministic stand-in for Claude when there is no API key (`AI_MODE=fake`).
 * It answers every forced-tool call with plausible, rule-based output so the
 * whole product — report intake, enrichment, authenticity, spot checks — runs
 * locally and in CI without spending tokens. Not a model: nothing it says
 * should be read as a verdict, and it never leaves the fake mode.
 */
@Injectable()
export class FakeLlmAdapter implements LlmPort {
  private readonly logger = new Logger(FakeLlmAdapter.name);
  private counter = 0;

  constructor() {
    this.logger.warn(
      'AI_MODE=fake — Claude is replaced by a rule-based stub; no API calls are made',
    );
  }

  async complete(request: LlmRequest): Promise<Anthropic.Message> {
    const forced = request.toolChoice?.type === 'tool' ? request.toolChoice.name : null;
    const text = lastUserText(request.messages);
    const tool = request.tools.find((t) => t.name === forced);
    const content: Anthropic.ContentBlock[] = tool
      ? [this.toolUse(tool.name, this.answer(tool, text))]
      : [{ type: 'text', text: fakeReply(text), citations: null }];
    return this.message(request.model, content, tool ? 'tool_use' : 'end_turn', text.length);
  }

  private answer(tool: Anthropic.Tool, text: string): Record<string, unknown> {
    switch (tool.name) {
      case 'parsed_report':
        return 'book_title' in schemaProps(tool) ? parseReading(text) : parseListening(text);
      case 'enriched_words':
        return { words: enrich(text) };
      case 'report_verdict':
        return verdict(text);
      case 'spot_check_verdict':
        return gradeSpotCheck(text);
      default:
        return fillSchema(tool.input_schema as JsonSchema);
    }
  }

  private toolUse(name: string, input: Record<string, unknown>): Anthropic.ToolUseBlock {
    this.counter += 1;
    return {
      type: 'tool_use',
      id: `fake_${this.counter}`,
      name,
      input,
      caller: { type: 'direct' },
    };
  }

  private message(
    model: string,
    content: Anthropic.ContentBlock[],
    stopReason: 'tool_use' | 'end_turn',
    inputChars: number,
  ): Anthropic.Message {
    const usage = {
      input_tokens: Math.ceil(inputChars / 4),
      output_tokens: 50,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      cache_creation: null,
      inference_geo: null,
      output_tokens_details: null,
      server_tool_use: null,
      service_tier: null,
    };
    this.counter += 1;
    // The SDK's Message type grows with every release; only the fields the
    // domain reads are meaningful here.
    return {
      id: `msg_fake_${this.counter}`,
      type: 'message',
      role: 'assistant',
      model,
      content,
      stop_reason: stopReason,
      stop_sequence: null,
      usage,
      container: null,
    } as unknown as Anthropic.Message;
  }
}

/* ---------- helpers (exported for tests) ---------- */

type JsonSchema = {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  enum?: unknown[];
  required?: string[];
};

function schemaProps(tool: Anthropic.Tool): Record<string, unknown> {
  return (tool.input_schema as JsonSchema).properties ?? {};
}

/** Last user turn as plain text (text blocks joined). */
export function lastUserText(messages: Anthropic.MessageParam[]): string {
  const last = [...messages].reverse().find((m) => m.role === 'user');
  if (!last) return '';
  if (typeof last.content === 'string') return last.content;
  return last.content
    .map((b) => (b.type === 'text' ? b.text : ''))
    .filter(Boolean)
    .join('\n');
}

/** Minimal value satisfying a strict JSON schema — for tools the stub does not know. */
export function fillSchema(schema: JsonSchema): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, prop] of Object.entries(schema.properties ?? {})) out[key] = fillValue(prop);
  return out;
}

function fillValue(prop: JsonSchema): unknown {
  const types = Array.isArray(prop.type) ? prop.type : [prop.type];
  if (types.includes('null')) return null;
  if (prop.enum && prop.enum.length > 0) return prop.enum[0];
  if (types.includes('array')) return [];
  if (types.includes('object')) return fillSchema(prop);
  if (types.includes('integer') || types.includes('number')) return 0;
  if (types.includes('boolean')) return false;
  return '';
}

const WORD_LIST_RE = /(?:слова|words|новые слова|new words)\s*[:—–-]\s*([^\n]+)/i;

/** "слова: drowsy — сонный, nap" → ["drowsy", "nap"] */
export function extractWords(text: string): string[] {
  const m = text.match(WORD_LIST_RE);
  if (!m) return [];
  return m[1]
    .split(/[,;]/)
    .map((s) => s.split(/\s[—–-]\s|\s*[—–]\s*|\s+-\s+/)[0].trim())
    .map((s) => s.replace(/[.!?]+$/, ''))
    .filter((s) => /^[A-Za-z][A-Za-z' -]*$/.test(s));
}

function firstInt(text: string, re: RegExp): number | null {
  const m = text.match(re);
  return m ? Number(m[1]) : null;
}

/** Sentences with mostly Latin letters — the student's English retelling. */
function englishSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n/)
    .map((s) => s.trim())
    .filter((s) => {
      const latin = (s.match(/[A-Za-z]/g) ?? []).length;
      const cyr = (s.match(/[А-Яа-яЁё]/g) ?? []).length;
      return s.split(/\s+/).length >= 3 && latin > cyr * 2 && !WORD_LIST_RE.test(s);
    });
}

/** A quoted span that looks like an English title: at least two Latin words. */
function quoted(text: string): string | null {
  for (const m of text.matchAll(/[«"“]([^»"”\n]{2,80})[»"”]/g)) {
    if ((m[1].match(/[A-Za-z]{2,}/g) ?? []).length >= 2) return m[1].trim();
  }
  return null;
}

const WORD = "[A-Za-z0-9'’:!?&-]+";
const RUN = `${WORD}(?:\\s+${WORD})*`;
/** A known series name with an optional Latin tail, or the Latin words right after "читал / слушал". */
const SERIES_RE = new RegExp(
  `((?:Harry Potter|6 Minute English|BBC Learning English|TED Talks?)(?:\\s*[—–-]?\\s*(?:${RUN}))?)`,
  'i',
);
const AFTER_VERB_RE = new RegExp(
  `(?:читал[аи]?|прочитал[аи]?|книг[ау]|book|слушал[аи]?|смотрел[аи]?|подкаст|podcast|сериал)\\s+(?:«|")?([A-Z${WORD.slice(1)}(?:\\s+${WORD})*)`,
);

function guessTitle(text: string): string | null {
  const series = text.match(SERIES_RE);
  if (series) return series[1].trim().replace(/\s*[—–-]\s*$/, '');
  const q = quoted(text);
  if (q) return q;
  const after = text.match(AFTER_VERB_RE);
  return after ? after[1].trim() : null;
}

export function parseReading(text: string): Record<string, unknown> {
  const words = extractWords(text);
  const body = text.replace(WORD_LIST_RE, '').trim();
  return {
    book_title: guessTitle(text),
    pages: firstInt(text, /(\d{1,4})\s*(?:стр|страниц|pages?|p\b)/i),
    summary: body.length > 0 ? body.slice(0, 400) : null,
    new_words: words,
  };
}

export function parseListening(text: string): Record<string, unknown> {
  const pcts = [...text.matchAll(/(\d{1,3})\s*%/g)]
    .map((m) => Number(m[1]))
    .filter((n) => n <= 100);
  const retelling = englishSentences(text).join(' ');
  return {
    source_title: guessTitle(text),
    episode: null,
    first_pass_pct: pcts[0] ?? null,
    second_pass_pct: pcts[1] ?? null,
    listen_count: firstInt(text, /(\d{1,2})\s*раз/i) ?? firstInt(text, /(\d{1,2})\s*times/i),
    retelling: retelling.length > 0 ? retelling : null,
    unclear_parts: [...text.matchAll(/непонятно[^:]*:\s*([^\n]+)/gi)].map((m) => m[1].trim()),
    new_words: extractWords(text),
  };
}

/** A tiny dictionary so demo data looks real; anything else gets a marked placeholder. */
const DICT: Record<string, string> = {
  postpone: 'откладывать',
  diligent: 'прилежный, старательный',
  stubborn: 'упрямый',
  resourceful: 'находчивый',
  drowsy: 'сонный',
  nap: 'короткий дневной сон',
  wand: 'волшебная палочка',
  muggle: 'магл, не волшебник',
  enchanted: 'зачарованный',
  apparently: 'по-видимому',
  cheat: 'мухлевать, жульничать',
  resilient: 'стойкий, жизнестойкий',
  itinerary: 'маршрут, план поездки',
  layover: 'пересадка, стыковка',
  'boarding pass': 'посадочный талон',
  customs: 'таможня',
  accommodation: 'жильё, размещение',
  sightseeing: 'осмотр достопримечательностей',
  'jet lag': 'сбой биоритма после перелёта',
  commute: 'ездить на работу',
  detour: 'объезд, крюк',
  souvenir: 'сувенир',
  delayed: 'задержанный',
  backpacker: 'турист с рюкзаком',
  gloomy: 'мрачный, унылый',
  keen: 'увлечённый',
  whisper: 'шептать',
  'look forward to': 'ждать с нетерпением',
  overwhelmed: 'перегруженный, ошеломлённый',
  reluctant: 'неохотный',
  thorough: 'тщательный',
};

export function enrich(text: string): Array<Record<string, unknown>> {
  let lemmas: string[] = [];
  try {
    const parsed = JSON.parse(text) as { lemmas?: unknown };
    if (Array.isArray(parsed.lemmas)) lemmas = parsed.lemmas.map(String);
  } catch {
    lemmas = extractWords(text);
  }
  return lemmas.map((lemma) => {
    const translation = DICT[lemma.toLowerCase()] ?? `перевод «${lemma}» (fake AI)`;
    return {
      lemma,
      translation,
      examples: [
        `I used the word "${lemma}" in a sentence today.`,
        `Can you explain what "${lemma}" means?`,
      ],
      cefr: 'B1',
      forms: [lemma],
      gap_sentences: [
        {
          sentence: `I used the word "___" in a sentence today.`,
          hint: `(${translation.split(',')[0]})`,
        },
        { sentence: `Can you explain what "___" means?`, hint: `(${translation.split(',')[0]})` },
      ],
      distractors: ['вариант А', 'вариант Б', 'вариант В'],
    };
  });
}

/** Never suspicious; plants a spot-check question when the report has a retelling. */
export function verdict(text: string): Record<string, unknown> {
  const retelling = englishSentences(text);
  const title = guessTitle(text);
  const listening = /аудирован|подкаст|слушал|смотрел|podcast|listening/i.test(text);
  return {
    suspicious: false,
    kinds: [],
    reason: 'Фейковый AI: признаков не ищет.',
    spot_check_question:
      listening && retelling.length > 0
        ? `Кстати, чем закончился${title ? ` «${title}»` : ' этот выпуск'} — что там было в конце?`
        : null,
  };
}

export function gradeSpotCheck(text: string): Record<string, unknown> {
  const answer = text.split(/ответ[^:]*:/i)[1] ?? text;
  const words = answer.trim().split(/\s+/).filter(Boolean).length;
  if (words === 0 || /не помню|don't remember|dont remember/i.test(answer))
    return { verdict: 'VAGUE', reason: 'Фейковый AI: ответа по сути нет.' };
  return words >= 4
    ? { verdict: 'OK', reason: 'Фейковый AI: ответ достаточно конкретный.' }
    : { verdict: 'VAGUE', reason: 'Фейковый AI: слишком коротко.' };
}

function fakeReply(text: string): string {
  return `Фейковый AI (AI_MODE=fake): настоящий ответ появится с ANTHROPIC_API_KEY. Получил ${text.length} символов.`;
}
