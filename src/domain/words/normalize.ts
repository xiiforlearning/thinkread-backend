/**
 * Word normalization shared by the vocabulary, imports and teacher lists.
 * The lemma is a lookup key, not a linguistic lemma: lower case, single
 * spaces, no surrounding punctuation, no leading "to " (infinitive marker).
 */
export function lemmaOf(raw: string): string {
  return raw
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/^[\s"'«»“”.,;:!?()[\]-]+|[\s"'«»“”.,;:!?()[\]-]+$/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^to\s+(?=[a-z])/, '')
    .trim();
}

/** Display form: trimmed, single spaces, original case kept except a leading capital on a single common word. */
export function displayWord(raw: string): string {
  return raw
    .normalize('NFKC')
    .replace(/^[\s"'«»“”.,;:!?()[\]-]+|[\s"'«»“”.,;:!?()[\]-]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isEnglishWord(s: string): boolean {
  return /^[a-z][a-z' -]*$/i.test(s.trim());
}

export interface ParsedWordLine {
  word: string;
  translation: string | null;
}

const SEPARATORS = [' — ', ' – ', ' - ', ' = ', ':', '\t', ' | '];

/**
 * Parse a free-form list: one word per line, or comma/semicolon separated,
 * optionally "word — translation" / "word - translation" / "word: translation".
 * Lines that do not start with a Latin word are ignored (headings, numbering
 * is stripped). Duplicates by lemma are collapsed, first translation wins.
 */
export function parseWordList(text: string): ParsedWordLine[] {
  const seen = new Map<string, ParsedWordLine>();
  const lines = text.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.replace(/^\s*(?:\d+[.)]|[-•*])\s*/, '').trim();
    if (!line) continue;
    const sep = SEPARATORS.find((s) => line.includes(s));
    if (sep) {
      const [left, ...rest] = line.split(sep);
      push(seen, left, rest.join(sep));
      continue;
    }
    // No translation on the line: several words may share it, separated by commas.
    for (const part of line.split(/[,;]/)) push(seen, part, '');
  }
  return [...seen.values()];
}

function push(seen: Map<string, ParsedWordLine>, rawWord: string, rawTranslation: string): void {
  const word = displayWord(rawWord);
  if (!word || !isEnglishWord(word)) return;
  const lemma = lemmaOf(word);
  if (!lemma) return;
  const translation = displayWord(rawTranslation) || null;
  const existing = seen.get(lemma);
  if (existing) {
    if (!existing.translation && translation) existing.translation = translation;
    return;
  }
  seen.set(lemma, { word, translation });
}
