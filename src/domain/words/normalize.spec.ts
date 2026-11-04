import { extractWordList, lemmaOf, parseWordList } from './normalize';

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

  it('takes the translation-first order, notes in brackets and dashes without spaces', () => {
    expect(
      parseWordList(
        'стойкий — resilient\nresilient (adj) — стойкий\nowl /aʊl/ - сова\ncupboard—шкаф\ne-mail\n',
      ),
    ).toEqual([
      { word: 'resilient', translation: 'стойкий' },
      { word: 'owl', translation: 'сова' },
      { word: 'cupboard', translation: 'шкаф' },
      { word: 'e-mail', translation: null },
    ]);
  });

  it("splits a plain hyphen before a Cyrillic translation (a student's real list)", () => {
    expect(
      parseWordList(
        'submerged-погруженн\nambushed-попали в засаду\ntor -веревка\nstained-окрашенный\nstubble-щетина\nwell-known - известный\nсова-owl',
      ),
    ).toEqual([
      { word: 'submerged', translation: 'погруженн' },
      { word: 'ambushed', translation: 'попали в засаду' },
      { word: 'tor', translation: 'веревка' },
      { word: 'stained', translation: 'окрашенный' },
      { word: 'stubble', translation: 'щетина' },
      { word: 'well-known', translation: 'известный' },
      { word: 'owl', translation: 'сова' },
    ]);
  });

  it('splits several pairs glued on one line and survives CR line ends (W3)', () => {
    expect(
      parseWordList(
        'purpose — цель support-поддерживать instead-вместо opportunity-возможность\r\nastounding-поразительный,earmuffs-наушники утеплители',
      ),
    ).toEqual([
      { word: 'purpose', translation: 'цель' },
      { word: 'support', translation: 'поддерживать' },
      { word: 'instead', translation: 'вместо' },
      { word: 'opportunity', translation: 'возможность' },
      { word: 'astounding', translation: 'поразительный' },
      { word: 'earmuffs', translation: 'наушники утеплители' },
    ]);
  });

  it('takes a space between the word and its translation as the separator', () => {
    expect(parseWordList('convince убеждать\nубеждать persuade\ngive up сдаваться')).toEqual([
      { word: 'convince', translation: 'убеждать' },
      { word: 'persuade', translation: 'убеждать' },
      { word: 'give up', translation: 'сдаваться' },
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

describe('extractWordList', () => {
  it('finds the explicit list after a marker, a column of words or "word — translation" lines', () => {
    expect(
      extractWordList(
        'I read 3 pages of “they both die at the end”. New words: tilted, silently, newfangled\n\nA man was thinking that he is sick, but the doctor said that he has a brain tumor.',
      ),
    ).toEqual({
      hasList: true,
      items: [
        { word: 'tilted', translation: null },
        { word: 'silently', translation: null },
        { word: 'newfangled', translation: null },
      ],
    });
    expect(
      extractWordList(
        'Title: The Queen’s Gambit\nBeth was sent to the orphanage in Kentucky.\n\nJanitor\nBeneath\nWithin в пределах',
      ).items,
    ).toEqual([
      { word: 'Janitor', translation: null },
      { word: 'Beneath', translation: null },
      { word: 'Within', translation: 'в пределах' },
    ]);
  });

  it('takes nothing from prose and nothing from the report headers', () => {
    expect(
      extractWordList(
        "Read 5 pages about Harry Potter, it was about Dursely family - they hates Potter's family, new words:",
      ),
    ).toEqual({ hasList: false, items: [] });
    expect(
      extractWordList(
        'Podcast : How to decorate\nEpisode: 489. Sam Cochran\nUnderstand: 75%\nListen to: 1 time',
      ).items,
    ).toEqual([]);
  });
});
