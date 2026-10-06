import type Anthropic from '@anthropic-ai/sdk';

/**
 * Rule-based simulators for every AI skill — what `AI_MODE=fake` answers.
 * Pure functions over the user text (the same text the model would get), so
 * they run in tests, in CI and in `pnpm ai:skill` without any model.
 */

export type JsonSchema = {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  enum?: unknown[];
  required?: string[];
};

export function schemaProps(tool: Anthropic.Tool): Record<string, unknown> {
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

/** ok when the sentence has at least three words and contains the word; a canned grammar hint for "i " lowercase. */
export function gradeSentence(text: string): Record<string, unknown> {
  let word = '';
  let sentence = text;
  try {
    const parsed = JSON.parse(text) as { word?: string; sentence?: string };
    word = String(parsed.word ?? '');
    sentence = String(parsed.sentence ?? '');
  } catch {
    /* plain text */
  }
  const lower = sentence.toLowerCase();
  const hasWord = word
    ? lower.includes(word.toLowerCase().split(' ')[0].replace(/^to /, ''))
    : true;
  const ok = hasWord && sentence.trim().split(/\s+/).length >= 3;
  const feedback = /(^|\s)i\s/.test(sentence)
    ? 'Местоимение I в английском всегда с большой буквы.'
    : null;
  return { ok, feedback };
}

export function simulateReply(text: string): string {
  return `Фейковый AI (AI_MODE=fake): настоящий ответ появится с ANTHROPIC_API_KEY. Получил ${text.length} символов.`;
}

/* ---------- teacher chat and parents' report (stage 8) ---------- */

interface FactsLike {
  student?: { name?: string; firstName?: string | null; silentDays?: number; health?: string };
  weeksMet?: { reading?: number; listening?: number; of?: number };
  totals?: {
    reports?: number;
    reading?: number;
    listening?: number;
    pages?: number;
    sources?: string[];
  };
  vocabulary?: {
    total?: number;
    learned?: number;
    addedInPeriod?: number;
    learnedInPeriod?: number;
  };
  stuckWords?: Array<{ word?: string; stage?: number; daysInLearning?: number }>;
  period?: { label?: string };
}

function parseFacts(text: string): { facts: FactsLike; question: string } {
  try {
    const parsed = JSON.parse(text) as { facts?: FactsLike; question?: string };
    return { facts: parsed.facts ?? {}, question: String(parsed.question ?? '') };
  } catch {
    return { facts: {}, question: text };
  }
}

/** Answers the teacher from the facts block with templates; a feedback draft when asked for one. */
export function teacherReply(text: string): Record<string, unknown> {
  const { facts, question } = parseFacts(text);
  const q = question.toLowerCase();
  const name = facts.student?.firstName || facts.student?.name?.split(' ')[0] || 'студент';
  const met = facts.weeksMet ?? {};
  const of = met.of ?? 4;
  const t = facts.totals ?? {};
  const v = facts.vocabulary ?? {};
  if (/черновик|обратн|фидбек|feedback/.test(q)) {
    return {
      draft: true,
      text: `${name}, за ${facts.period?.label ?? 'последние недели'} ты сдал(а) ${t.reports ?? 0} отчётов и добавил(а) ${v.addedInPeriod ?? 0} слов — хорошая динамика, так держать. Норма по чтению выполнена ${met.reading ?? 0} из ${of} недель, по аудированию — ${met.listening ?? 0} из ${of}. Попробуй один короткий подкаст в середине недели, чтобы не оставлять всё на выходные.`,
    };
  }
  if (/застря|слов/.test(q)) {
    const stuck = facts.stuckWords ?? [];
    return {
      draft: false,
      text:
        stuck.length === 0
          ? 'Застрявших слов нет: все слова в изучении добавлены меньше двух недель назад или уже прошли стадии.'
          : `Дольше всего в изучении: ${stuck
              .slice(0, 3)
              .map((w) => `${w.word} (стадия ${w.stage}, ${w.daysInLearning} дн.)`)
              .join(
                ', ',
              )}. На уроке можно дать с ними по одному предложению — после верного ответа они уйдут дальше.`,
    };
  }
  if (/хуже|слаб|трудн/.test(q)) {
    const r = met.reading ?? 0;
    const l = met.listening ?? 0;
    const side = l < r ? 'аудирование' : r < l ? 'чтение' : null;
    return {
      draft: false,
      text: side
        ? `Хуже даётся ${side}: норма выполнена ${side === 'аудирование' ? l : r} из ${of} недель против ${side === 'аудирование' ? r : l} по ${side === 'аудирование' ? 'чтению' : 'аудированию'}. ${side === 'аудирование' ? 'Предложите один короткий подкаст в середине недели.' : 'Страниц мало — можно взять книгу полегче.'}`
        : `Обе нормы идут ровно: чтение ${r} из ${of} недель, аудирование ${l} из ${of}. Слабое место скорее словарь: выучено ${v.learned ?? 0} из ${v.total ?? 0}.`,
    };
  }
  const s = facts.student ?? {};
  return {
    draft: false,
    text: `За ${facts.period?.label ?? 'период'} ${name}: отчётов ${t.reports ?? 0} (чтение ${t.reading ?? 0}, аудирование ${t.listening ?? 0}), норма по чтению выполнена ${met.reading ?? 0} из ${of} недель, по аудированию — ${met.listening ?? 0} из ${of}. Слов в словаре ${v.total ?? 0}, выучено ${v.learned ?? 0}. Тишина: ${s.silentDays ?? 0} дн.${s.health === 'bad' ? ' Это спад — стоит поговорить лично.' : s.health === 'warn' ? ' Темп чуть ниже нормы, но регулярность есть.' : ' Стабильный темп.'}`,
  };
}

export function parentReport(text: string): Record<string, unknown> {
  const { facts } = parseFacts(text);
  const name = facts.student?.name ?? 'Студент';
  const t = facts.totals ?? {};
  const met = facts.weeksMet ?? {};
  const v = facts.vocabulary ?? {};
  if (!t.reports)
    return {
      text: `За ${facts.period?.label ?? 'период'} ${name} не сдавал(а) отчётов о чтении и аудировании. Словарь: ${v.total ?? 0} слов, выучено ${v.learned ?? 0}. Будем рады, если занятия продолжатся в обычном ритме.`,
    };
  const sources = (t.sources ?? [])
    .slice(0, 3)
    .map((x) => `«${x}»`)
    .join(', ');
  return {
    text: `За ${facts.period?.label ?? 'период'} ${name} сдал(а) ${t.reading ?? 0} отчётов о чтении и ${t.listening ?? 0} об аудировании: норма по чтению выполнена ${met.reading ?? 0} недели из ${met.of ?? 4}, по аудированию — ${met.listening ?? 0} из ${met.of ?? 4}. Прочитано около ${t.pages ?? 0} страниц${sources ? ` (${sources})` : ''}. В словарь добавлено ${v.addedInPeriod ?? 0} слов, выучено ${v.learnedInPeriod ?? 0}.`,
  };
}
