import { isRecallCorrect, levenshtein, normalizeRecall } from './recall';

describe('normalizeRecall', () => {
  it('lowercases, trims, and collapses whitespace', () => {
    expect(normalizeRecall('  Hello   World ')).toBe('hello world');
  });

  it('strips surrounding punctuation but keeps internal', () => {
    expect(normalizeRecall('"hello!"')).toBe('hello');
    expect(normalizeRecall('in-laws')).toBe('in-laws');
  });
});

describe('levenshtein', () => {
  it('computes edit distance', () => {
    expect(levenshtein('hello', 'hello')).toBe(0);
    expect(levenshtein('hello', 'helo')).toBe(1);
    expect(levenshtein('hello', 'world')).toBe(4);
    expect(levenshtein('', 'abc')).toBe(3);
  });
});

describe('isRecallCorrect', () => {
  it('accepts exact match ignoring case and spacing', () => {
    expect(isRecallCorrect('Hello', ' hello ')).toBe(true);
  });

  it('tolerates a single typo for words of length >= 4', () => {
    expect(isRecallCorrect('hello', 'helo')).toBe(true); // deletion, distance 1
    expect(isRecallCorrect('reluctant', 'reluctan')).toBe(true); // trailing deletion, distance 1
    expect(isRecallCorrect('venture', 'venturr')).toBe(true); // substitution, distance 1
  });

  it('rejects two or more edits', () => {
    expect(isRecallCorrect('hello', 'world')).toBe(false);
    expect(isRecallCorrect('hello', 'helllooo')).toBe(false);
  });

  it('requires an exact match for short words (< 4 chars)', () => {
    expect(isRecallCorrect('go', 'go')).toBe(true);
    expect(isRecallCorrect('go', 'ga')).toBe(false);
  });

  it('never matches an empty answer', () => {
    expect(isRecallCorrect('word', '')).toBe(false);
    expect(isRecallCorrect('word', '   ')).toBe(false);
  });

  it('ignores surrounding punctuation', () => {
    expect(isRecallCorrect('venture', 'venture.')).toBe(true);
  });
});
