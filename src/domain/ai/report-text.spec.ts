import { dedupeText, findQuote, isConnectedText, proseOf, wordCount } from './report-text';

describe('report text helpers', () => {
  it('proseOf drops the word list and keeps the retelling', () => {
    const text =
      'I read 5 pages about how Darley has a birthday and he with a friend are going to zoo. Then Harry could not stay at home.\nNew words-astride-верхом,bushy-густой,bundle-пучок,tuft-прядь\nscar-шрам';
    expect(proseOf(text)).toBe(
      'I read 5 pages about how Darley has a birthday and he with a friend are going to zoo. Then Harry could not stay at home.',
    );
  });

  it('proseOf drops a bare column of words without a header', () => {
    const text =
      'Bella tells about her first day at school and the five strangers who drew her attention in the cafeteria, and she describes every detail of how they look.\n\nGlitch\nWhooshing\nSettled\nCreeping up\nWithin в пределах';
    expect(proseOf(text)).toMatch(/^Bella tells/);
    expect(proseOf(text)).not.toMatch(/Glitch|Within/);
  });

  it('a word list is not connected text, a retelling is', () => {
    expect(
      isConnectedText('New words:\nreliable - надежный\navoid - избегать\nappear - появляться'),
    ).toBe(false);
    expect(
      isConnectedText(
        'The story begins with the Dursley family. They are normal people and dont like anything strange. They have a son named Dudley, who is very spoiled. Mrs Dursley has a sister named Lily Potter, but they dont talk to each other. One day Mr Dursly sees strange things like a cat looking at a map.',
      ),
    ).toBe(true);
  });

  it('dedupeText removes lines and paragraphs pasted twice, keeping the first', () => {
    const text =
      'I understood 87-90%\nBut sometimes lead to turn on the subtitles\n\nI understood 87-90%\nBut sometimes lead to turn on the subtitles\nI listened full podcast\nI listened full podcast\nI listened full podcast';
    expect(dedupeText(text)).toBe(
      'I understood 87-90%\nBut sometimes lead to turn on the subtitles\n\nI listened full podcast',
    );
    const block =
      'Today I read two stories. The first one was about a woman who went to the church and there was death people around her.';
    const edited =
      'Today I read scary stories book. The first one was about a woman who went to the church and there was death people around her.';
    expect(dedupeText(`${block}\n\n${edited}`)).toBe(block);
  });

  it('findQuote tolerates typos and punctuation but not two-word fishing', () => {
    const text =
      'One day, Mr Dursly seas strange things, like a cat looking at a map people wearing strange clothes';
    expect(findQuote('Mr Dursley sees strange things', text)).toBe(true);
    expect(findQuote('a cat looking at a map', text)).toBe(true);
    expect(findQuote('did not graduate from Yale in 1915', text)).toBe(false);
    expect(findQuote('strange things', text)).toBe(true);
    expect(findQuote('things', text)).toBe(false);
    expect(wordCount('Hello, world — ещё раз!')).toBe(4);
  });
});
