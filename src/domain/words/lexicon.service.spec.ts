import { LexiconService } from './lexicon.service';
import { WordLexicon } from './word-lexicon.entity';

type Row = Omit<WordLexicon, 'createdAt' | 'updatedAt'>;
const row = (lemma: string): Row =>
  ({
    lemma,
    translation: 'x',
    examples: [],
    cefr: null,
    forms: [],
    gapSentences: [],
    distractors: [],
  }) as unknown as Row;

describe('LexiconService.upsert', () => {
  it('stores each lemma once and keeps going when one row is refused', async () => {
    const upsert = jest.fn().mockImplementation(async (r: Row) => {
      if (r.lemma === 'bad') throw new Error('value too long');
    });
    const svc = new LexiconService({ upsert } as never);

    const stored = await svc.upsert([
      row('put something out of mind'),
      row('bad'),
      row('mutter'),
      row('put something out of mind'),
    ]);

    expect(stored).toBe(2);
    expect(upsert.mock.calls.map((c) => (c[0] as Row).lemma)).toEqual([
      'put something out of mind',
      'bad',
      'mutter',
    ]);
  });

  it('stores nothing for an empty batch', async () => {
    const upsert = jest.fn();
    const svc = new LexiconService({ upsert } as never);
    expect(await svc.upsert([])).toBe(0);
    expect(upsert).not.toHaveBeenCalled();
  });
});
