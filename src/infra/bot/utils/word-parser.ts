import type { ParsedWord } from '../../../domain/words/parsed-word';

export type { ParsedWord };

// Strip leading bullets, numbering, and punctuation. The character class covers
// • - – — *, ASCII digits, dot, and closing paren. Whitespace around is also eaten.
const LEADING_BULLET = /^[\s•\-–—*0-9.)]+/;

const PATTERNS: RegExp[] = [
  /^(.+?)\s*[—–]\s*(.+)$/,    // em-dash or en-dash, spaces optional
  /^(.+?)\s+-\s+(.+)$/,        // hyphen, requires surrounding spaces (preserves "in-laws")
  /^(.+?)\s*:\s+(.+)$/,        // colon, requires space after
];

export function parseWords(input: string): ParsedWord[] {
  if (!input || typeof input !== 'string') return [];

  const out: ParsedWord[] = [];
  for (const rawLine of input.split(/\r?\n/)) {
    const line = rawLine.replace(LEADING_BULLET, '').trim();
    if (line.length === 0) continue;

    for (const re of PATTERNS) {
      const m = line.match(re);
      if (m) {
        const word = m[1].trim();
        const translation = m[2].trim();
        if (word.length > 0 && translation.length > 0) {
          out.push({ word, translation });
        }
        break;
      }
    }
  }
  return out;
}
