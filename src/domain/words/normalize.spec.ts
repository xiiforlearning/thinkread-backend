import { lemmaOf, parseWordList } from './normalize';

describe('lemmaOf', () => {
  it('lower-cases, trims punctuation and the infinitive marker', () => {
    expect(lemmaOf('  Postpone. ')).toBe('postpone');
    expect(lemmaOf('to look forward to')).toBe('look forward to');
    expect(lemmaOf('“Muggle”')).toBe('muggle');
    expect(lemmaOf('don’t')).toBe("don't");
  });
});

describe('parseWordList', () => {
  it('reads one word per line with optional translations', () => {
    expect(
      parseWordList('resilient — стойкий\nstubborn - упрямый\ncheat: мухлевать\nnap\n'),
    ).toEqual([
      { word: 'resilient', translation: 'стойкий' },
      { word: 'stubborn', translation: 'упрямый' },
      { word: 'cheat', translation: 'мухлевать' },
      { word: 'nap', translation: null },
    ]);
  });

  it('splits comma lists, strips numbering and ignores non-English lines', () => {
    expect(parseWordList('Слова из подкаста:\n1. wand, owl; cupboard\n2) to postpone\n')).toEqual([
      { word: 'wand', translation: null },
      { word: 'owl', translation: null },
      { word: 'cupboard', translation: null },
      { word: 'to postpone', translation: null },
    ]);
  });

  it('collapses duplicates by lemma and keeps the first translation', () => {
    expect(parseWordList('Wand — палочка\nwand\nWAND — жезл')).toEqual([
      { word: 'Wand', translation: 'палочка' },
    ]);
    expect(parseWordList('wand\nwand — палочка')).toEqual([
      { word: 'wand', translation: 'палочка' },
    ]);
  });
});
