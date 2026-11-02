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
 * dash even without spaces, a plain hyphen when a non-Latin translation touches it
 * ("submerged-погруженный", "tor -верёвка", "сова-owl"; the hyphen of "e-mail" stays), "=",
 * ":", a tab or "|".
 */
const SEPARATOR =
  /\s[-—–]\s|[—–]|(?<=\p{L})(?<!\p{Script=Latin})\s*-\s*|\s*-\s*(?=\p{L})(?!\p{Script=Latin})|\s=\s|:|\t|\s\|\s/u;

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
  const lines = text.split(/\r\n?|\n/).flatMap(splitGluedPairs);
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

/**
 * "purpose — цель support-поддерживать instead-вместо": several pairs glued on one line become
 * one line each. The cut is before a Latin word that is followed by a separator and preceded by a
 * non-Latin translation; a line with one pair or none is returned as is.
 */
export function splitGluedPairs(line: string): string[] {
  const pairs = line.match(/[A-Za-z][A-Za-z'’ ]*?\s*(?:\s[-—–]\s|[—–]|-|:|=)\s*[^A-Za-z]+/gu);
  if (!pairs || pairs.length < 2) return [line];
  return line
    .split(
      /(?<=\P{Script=Latin})[\s,;]+(?=[A-Za-z][A-Za-z'’]*(?:\s+[A-Za-z'’]+){0,3}\s*(?:[-—–:=]))/u,
    )
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Words of up to this many tokens; a longer "word" is a sentence that slipped into the list. */
const MAX_WORD_TOKENS = 4;

const LIST_MARKER = /(?:new\s+words|новые\s+слова|vocabulary|words|слова)\s*[:—–-]?\s*/i;

/**
 * The part of a free-text report that is the student's explicit word list: everything after a
 * "New words" marker, plus any line shaped as "word — translation" or a short column of words.
 * Sentences are never part of it, so the retelling cannot leak into the dictionary.
 */
export function extractWordList(text: string): { hasList: boolean; items: ParsedWordLine[] } {
  const clean = text.replace(/\r\n?/g, '\n');
  const marker = LIST_MARKER.exec(clean);
  const candidates: string[] = [];
  if (marker) candidates.push(clean.slice(marker.index + marker[0].length));
  for (const line of clean.split('\n').flatMap(splitGluedPairs)) {
    const trimmed = line
      .replace(/^\s*(?:\d+[.)]|[-•*])\s*/, '')
      // "owl сова": a Latin word and its translation with only a space between.
      .replace(/^([A-Za-z][A-Za-z'’ -]{0,40}?)\s+(?=\p{Script=Cyrillic})/u, '$1 — ')
      .trim();
    if (!trimmed || new RegExp(`^${LIST_MARKER.source}$`, 'i').test(trimmed)) continue;
    const sep = SEPARATOR.exec(trimmed);
    if (sep) {
      const left = trimmed.slice(0, sep.index);
      const right = trimmed.slice(sep.index + sep[0].length).trim();
      // "Title: The Queen's Gambit", "Understood: 75%" are headers of the report, not pairs.
      const translationLike = right === '' || (/\p{L}/u.test(right) && !/[A-Za-z]/.test(right));
      if (isShortPhrase(left) && translationLike && !LIST_MARKER.test(left))
        candidates.push(trimmed);
    } else if (isShortPhrase(trimmed) && !/[.!?]$/.test(trimmed)) candidates.push(trimmed);
  }
  const items = parseWordList(candidates.join('\n')).filter((i) => isShortPhrase(i.word));
  return { hasList: items.length > 0, items };
}

function isShortPhrase(s: string): boolean {
  const word = displayWord(stripNotes(s));
  return isEnglishWord(word) && word.split(' ').length <= MAX_WORD_TOKENS;
}

function push(seen: Map<string, ParsedWordLine>, rawWord: string, rawTranslation: string): void {
  const word = displayWord(stripNotes(rawWord));
  if (!word || !isEnglishWord(word)) return;
  if (word.split(' ').length > MAX_WORD_TOKENS * 2) return;
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
