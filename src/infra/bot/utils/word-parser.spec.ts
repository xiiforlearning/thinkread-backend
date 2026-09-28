import { parseWords } from './word-parser';

describe('parseWords', () => {
  it('returns [] for empty / whitespace / non-string input', () => {
    expect(parseWords('')).toEqual([]);
    expect(parseWords('   \n\n   ')).toEqual([]);
    // @ts-expect-error testing runtime safety
    expect(parseWords(null)).toEqual([]);
    // @ts-expect-error testing runtime safety
    expect(parseWords(undefined)).toEqual([]);
  });

  it('parses em-dash separator with optional surrounding spaces', () => {
    expect(parseWords('gaudy — броский')).toEqual([{ word: 'gaudy', translation: 'броский' }]);
    expect(parseWords('gaudy—броский')).toEqual([{ word: 'gaudy', translation: 'броский' }]);
  });

  it('parses en-dash separator', () => {
    expect(parseWords('vivid – яркий')).toEqual([{ word: 'vivid', translation: 'яркий' }]);
  });

  it('parses hyphen only when surrounded by spaces, preserving "in-laws"', () => {
    expect(parseWords('in-laws - родственники супруга')).toEqual([
      { word: 'in-laws', translation: 'родственники супруга' },
    ]);
    // unspaced hyphen is part of the word, line falls through and is skipped
    expect(parseWords('in-laws')).toEqual([]);
  });

  it('hyphen with no surrounding spaces does not split a compound word in the em-dash case', () => {
    expect(parseWords('in-laws — родственники')).toEqual([
      { word: 'in-laws', translation: 'родственники' },
    ]);
  });

  it('parses colon separator when followed by a space', () => {
    expect(parseWords('jerking: дёргая')).toEqual([{ word: 'jerking', translation: 'дёргая' }]);
  });

  it('does not parse colon without trailing space', () => {
    expect(parseWords('foo:bar')).toEqual([]);
  });

  it('strips leading bullets and numbering', () => {
    const input = [
      '• gaudy — броский',
      '- vivid – яркий',
      '1. tense - напряжённый',
      '2) lurid — кричащий',
      '— blunt — тупой',
      '* sharp — острый',
    ].join('\n');
    expect(parseWords(input)).toEqual([
      { word: 'gaudy', translation: 'броский' },
      { word: 'vivid', translation: 'яркий' },
      { word: 'tense', translation: 'напряжённый' },
      { word: 'lurid', translation: 'кричащий' },
      { word: 'blunt', translation: 'тупой' },
      { word: 'sharp', translation: 'острый' },
    ]);
  });

  it('skips lines with no recognised separator and keeps order', () => {
    const input = [
      'gaudy — броский',
      'this line has no separator',
      'vivid – яркий',
    ].join('\n');
    expect(parseWords(input)).toEqual([
      { word: 'gaudy', translation: 'броский' },
      { word: 'vivid', translation: 'яркий' },
    ]);
  });

  it('trims whitespace around word and translation', () => {
    expect(parseWords('   gaudy   —   броский   ')).toEqual([
      { word: 'gaudy', translation: 'броский' },
    ]);
  });

  it('handles multi-word phrases as a single word', () => {
    expect(parseWords('jerking his thumb — дёргая большим пальцем')).toEqual([
      { word: 'jerking his thumb', translation: 'дёргая большим пальцем' },
    ]);
  });

  it('tries em-dash first, then hyphen, then colon (em-dash wins over colon in same line)', () => {
    expect(parseWords('cold — холодный: ice cube')).toEqual([
      { word: 'cold', translation: 'холодный: ice cube' },
    ]);
  });

  it('drops entries whose word or translation is empty after trim', () => {
    expect(parseWords('  —  броский  ')).toEqual([]);
    expect(parseWords('gaudy —   ')).toEqual([]);
  });
});
