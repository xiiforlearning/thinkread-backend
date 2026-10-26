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

/** "resilient (adj)", "resilient /rɪˈzɪliənt/", "resilient [B2]" → "resilient": notes are not the word. */
function stripNotes(s: string): string {
  return s
    .replace(/\([^)]*\)|\[[^\]]*\]|\/[^/]*\//g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The first "word — translation" separator on a line: a dash with spaces around it, an em/en
 * dash even without spaces (a plain hyphen without spaces stays inside "e-mail"), "=", ":",
 * a tab or "|".
 */
const SEPARATOR = /\s[-—–]\s|[—–]|\s=\s|:|\t|\s\|\s/;

export interface ParsedWordLine {
  word: string;
  translation: string | null;
}

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
    const sep = SEPARATOR.exec(line);
    if (sep) {
      const left = line.slice(0, sep.index);
      const right = line.slice(sep.index + sep[0].length);
      // "стойкий — resilient": the translation came first.
      if (
        !isEnglishWord(stripNotes(displayWord(left))) &&
        isEnglishWord(stripNotes(displayWord(right)))
      )
        push(seen, right, left);
      else push(seen, left, right);
      continue;
    }
    // No translation on the line: several words may share it, separated by commas.
    for (const part of line.split(/[,;]/)) push(seen, part, '');
  }
  return [...seen.values()];
}

function push(seen: Map<string, ParsedWordLine>, rawWord: string, rawTranslation: string): void {
  const word = displayWord(stripNotes(rawWord));
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
