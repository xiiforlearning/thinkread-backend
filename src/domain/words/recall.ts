/**
 * Reverse-recall matching for the morning self-check: the student is shown the
 * translation and types the English word. Matching is lenient — case/whitespace
 * insensitive with a small edit-distance tolerance for typos — so an honest
 * student is not failed by a stray character, while a blank/AI-copy mismatch
 * still fails.
 */

/** Lowercase, trim, collapse internal whitespace, drop surrounding punctuation. */
export function normalizeRecall(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}

/** Levenshtein edit distance. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[b.length];
}

/**
 * True if `answer` matches the `expected` English word. Allows an edit distance
 * of 1 for words of length ≥ 4 (typo tolerance), exact match otherwise. An empty
 * answer never matches.
 */
export function isRecallCorrect(expected: string, answer: string): boolean {
  const e = normalizeRecall(expected);
  const a = normalizeRecall(answer);
  if (a.length === 0) return false;
  if (e === a) return true;
  const tolerance = e.length >= 4 ? 1 : 0;
  return levenshtein(e, a) <= tolerance;
}
