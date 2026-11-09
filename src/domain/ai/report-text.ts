/**
 * Pure text helpers shared by report intake and the authenticity check: what counts as the
 * student's connected prose (as opposed to a word list), duplicate lines pasted twice, and
 * whether a quote the model cites really occurs in a text.
 */

/** Lower case, ё→е, straight quotes, letters/digits/apostrophes only, single spaces. */
export function normalizeForMatch(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[‘’ʼ`´]/g, "'")
    .replace(/[^\p{L}\p{N}' ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokens(s: string): string[] {
  const n = normalizeForMatch(s);
  return n ? n.split(' ') : [];
}

export function wordCount(s: string): number {
  return tokens(s).length;
}

/** "word — translation", "word-перевод", "word: перевод", a lone short item: a list line, not prose. */
const PAIR_SEPARATOR =
  /\s[-—–]\s|[—–]|[^\s\p{L}][-:]|[-:][^\s\p{L}]|\p{Script=Latin}-\P{Script=Latin}|\P{Script=Latin}-\p{Script=Latin}|:/u;
const LIST_MARKER = /^\s*(new\s+words|новые\s+слова|слова|vocabulary|words)\s*[:\-—]?\s*/i;

function isListLine(line: string): boolean {
  const words = wordCount(line);
  if (words === 0) return false;
  if (words <= 3) return true;
  if (words <= 8 && PAIR_SEPARATOR.test(line)) return true;
  // "a, b, c, d" — a comma list with short items
  const items = line
    .split(/[,;]/)
    .map((x) => x.trim())
    .filter(Boolean);
  return items.length >= 4 && items.every((x) => wordCount(x) <= 3);
}

/**
 * The connected prose of a report: lines that read as sentences, without the "New words"
 * section and other list lines. This is what style is judged on; a word list is not prose.
 */
export function proseOf(text: string): string {
  const out: string[] = [];
  let inList = false;
  for (const raw of text.split(/\r?\n|\r/)) {
    const line = raw.trim();
    if (!line) continue;
    if (LIST_MARKER.test(line)) {
      inList = true;
      const rest = line.replace(LIST_MARKER, '').trim();
      if (rest && !isListLine(rest) && wordCount(rest) > 8) out.push(rest);
      continue;
    }
    if (inList && isListLine(line)) continue;
    if (isListLine(line)) continue;
    inList = false;
    out.push(line);
  }
  return out.join('\n');
}

/** Enough connected prose to judge style on: at least this many words outside the word list. */
export const MIN_PROSE_WORDS = 40;

export function isConnectedText(text: string): boolean {
  return wordCount(proseOf(text)) >= MIN_PROSE_WORDS;
}

/** Token-set similarity (Jaccard). */
function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const sa = new Set(a);
  const sb = new Set(b);
  let common = 0;
  for (const t of sa) if (sb.has(t)) common += 1;
  return common / (sa.size + sb.size - common);
}

/**
 * Drop lines and paragraphs the student pasted twice (a message sent again, a clarification
 * answered twice): exact duplicates by normalized form, and paragraphs of 6+ words that are
 * ≥ 80 % the same tokens as an earlier one. The first occurrence stays, order is kept.
 */
export function dedupeText(text: string): string {
  const seenLines = new Set<string>();
  const keptParagraphs: string[][] = [];
  const outParagraphs: string[] = [];
  for (const paragraph of text.split(/\n\s*\n/)) {
    const lines: string[] = [];
    for (const raw of paragraph.split(/\r?\n|\r/)) {
      const key = normalizeForMatch(raw);
      if (!key) continue;
      if (seenLines.has(key)) continue;
      seenLines.add(key);
      lines.push(raw.trim());
    }
    if (lines.length === 0) continue;
    const toks = tokens(lines.join(' '));
    if (toks.length >= 6 && keptParagraphs.some((p) => jaccard(p, toks) >= 0.8)) continue;
    keptParagraphs.push(toks);
    outParagraphs.push(lines.join('\n'));
  }
  return outParagraphs.join('\n\n');
}

/** Character-bigram Dice similarity: tolerant to typos ("Dursly" ~ "Dursley"). */
function bigramDice(a: string, b: string): number {
  const grams = (s: string): Map<string, number> => {
    const m = new Map<string, number>();
    for (let i = 0; i + 1 < s.length; i += 1) {
      const g = s.slice(i, i + 2);
      m.set(g, (m.get(g) ?? 0) + 1);
    }
    return m;
  };
  const ga = grams(a);
  const gb = grams(b);
  let common = 0;
  for (const [g, n] of ga) common += Math.min(n, gb.get(g) ?? 0);
  const total = a.length - 1 + (b.length - 1);
  return total <= 0 ? 0 : (2 * common) / total;
}

/**
 * Does `quote` occur in `text`? Exact after normalization, or a window of the same number of
 * words that is ≥ 75 % similar by character bigrams (typos, a changed word). Quotes under two
 * words never match: too easy to "find".
 */
export function findQuote(quote: string, text: string): boolean {
  const q = normalizeForMatch(quote);
  const qt = q ? q.split(' ') : [];
  if (qt.length < 2) return false;
  const t = normalizeForMatch(text);
  if (t.includes(q)) return true;
  const tt = t.split(' ');
  if (tt.length <= qt.length) return bigramDice(q, t) >= 0.75;
  for (const width of [qt.length, qt.length + 1, qt.length - 1]) {
    if (width < 2) continue;
    for (let i = 0; i + width <= tt.length; i += 1) {
      if (bigramDice(q, tt.slice(i, i + width).join(' ')) >= 0.75) return true;
    }
  }
  return false;
}

const MAX_CONTEXT_CHARS = 220;

/**
 * The sentence of the student's prose where `word` is used (W6: the dictionary shows the word
 * in the student's own sentence, and the translation follows that meaning). Simple inflections
 * (walks, walked, walking, boxes) count; the word list itself is never searched. Null when the
 * word is not used in the retelling.
 */
export function sentenceWith(text: string, word: string): string | null {
  const head = word
    .trim()
    .toLowerCase()
    .replace(/^to\s+/, '');
  if (!head) return null;
  const escaped = head.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  const re = new RegExp(`(?<![a-z])${escaped}(?:s|es|ed|d|ing)?(?![a-z])`, 'i');
  for (const raw of proseOf(text).split(/(?<=[.!?…])\s+|\n+/)) {
    const sentence = raw.trim();
    if (!sentence || !re.test(sentence)) continue;
    return sentence.length > MAX_CONTEXT_CHARS
      ? `${sentence.slice(0, MAX_CONTEXT_CHARS - 1)}…`
      : sentence;
  }
  return null;
}
