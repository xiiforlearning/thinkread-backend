import { Student } from '../../students/student.entity';
import { Word } from '../../words/word.entity';
import { WordPriority, WordSource, WordStatus } from '../../words/word.enums';
import { ToolContext } from '../tool';
import {
  AddRecommendedWordsTool,
  AddWordsTool,
  ExportVocabularyTool,
  SetWordStatusTool,
} from './vocabulary.tools';

const NOW = new Date('2026-10-01T09:00:00Z');

function ctx(): ToolContext {
  const student = Object.assign(new Student(), { id: 's1', level: null, dialogState: {} });
  return { student, now: NOW, timeZone: 'Asia/Tashkent', message: { text: 'x', forwarded: false } };
}

function word(over: Partial<Word>): Word {
  return Object.assign(new Word(), {
    id: 'w1',
    word: 'wand',
    lemma: 'wand',
    translation: null,
    cefr: null,
    status: WordStatus.LEARNING,
    stage: 1,
    priority: WordPriority.HIGH,
    source: WordSource.MANUAL,
    ...over,
  });
}

describe('add_words', () => {
  it('adds a few words right away, enriches them and returns the fresh rows', async () => {
    const added = word({});
    const words = {
      addWords: jest.fn().mockResolvedValue({
        added: [added],
        existing: [],
        learned: [word({ id: 'w2', word: 'owl', status: WordStatus.LEARNED })],
      }),
      findById: jest
        .fn()
        .mockResolvedValue(word({ translation: 'волшебная палочка', cefr: 'B1' as never })),
    };
    const enrichment = { enrich: jest.fn().mockResolvedValue(1) };
    const imports = { createPreview: jest.fn() };
    const tool = new AddWordsTool(words as never, imports as never, enrichment as never);

    const res = await tool.handle(
      {
        words: [
          { word: 'wand', translation: null },
          { word: 'owl', translation: 'сова' },
        ],
      },
      ctx(),
    );

    expect(words.addWords).toHaveBeenCalledWith(
      expect.anything(),
      [
        { word: 'wand', translation: null },
        { word: 'owl', translation: 'сова' },
      ],
      { source: WordSource.MANUAL },
    );
    expect(enrichment.enrich).toHaveBeenCalledWith(['wand'], 's1');
    expect(res.data).toMatchObject({
      added: [{ word: 'wand', translation: 'волшебная палочка' }],
      alreadyLearned: ['owl'],
    });
    expect(String(res.data.hint)).toContain('вернуть');
    expect(imports.createPreview).not.toHaveBeenCalled();
  });

  it('turns more than five words into a preview with confirm buttons and adds nothing', async () => {
    const words = { addWords: jest.fn() };
    const imports = {
      createPreview: jest
        .fn()
        .mockResolvedValue({ importId: 'imp1', found: 7, duplicates: 2, toAdd: 5, items: [] }),
    };
    const tool = new AddWordsTool(words as never, imports as never, { enrich: jest.fn() } as never);
    const list = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((w) => ({ word: w, translation: null }));

    const res = await tool.handle({ words: list }, ctx());

    expect(words.addWords).not.toHaveBeenCalled();
    expect(res.data).toMatchObject({
      preview: true,
      importId: 'imp1',
      found: 7,
      duplicates: 2,
      toAdd: 5,
    });
    expect(res.keyboard).toEqual([
      [
        { text: 'Добавить 5', callbackData: 'wimport:ok:imp1' },
        { text: 'Отмена', callbackData: 'wimport:no:imp1' },
      ],
    ]);
  });
});

describe('set_word_status', () => {
  it('reports a word that is not in the vocabulary instead of failing', async () => {
    const words = { findByWord: jest.fn().mockResolvedValue(null), setStatus: jest.fn() };
    const res = await new SetWordStatusTool(words as never).handle(
      { word: 'nope', status: WordStatus.LEARNED },
      ctx(),
    );
    expect(res.data).toMatchObject({ updated: false });
    expect(words.setStatus).not.toHaveBeenCalled();
  });
});

describe('export_vocabulary', () => {
  it('returns the file as a document with a dated name', async () => {
    const words = { exportText: jest.fn().mockResolvedValue('wand — палочка\n') };
    const res = await new ExportVocabularyTool(words as never).handle({ format: 'txt' }, ctx());
    expect(res.document).toEqual({
      filename: 'thinkread-words-2026-10-01.txt',
      content: 'wand — палочка\n',
      mime: 'text/plain',
    });
  });
});

describe('add_recommended_words', () => {
  const recs = [
    {
      list: { id: 'l1', title: 'Unit 5' },
      items: [
        { id: 'i1', lemma: 'itinerary', word: 'itinerary' },
        { id: 'i2', lemma: 'layover', word: 'layover' },
      ],
    },
  ];

  it('accepts only the named words and enriches them in the background', async () => {
    const lists = {
      recommendedFor: jest.fn().mockResolvedValue(recs),
      accept: jest.fn().mockResolvedValue({
        added: [word({ word: 'layover', lemma: 'layover' })],
        existing: [],
        learned: [],
      }),
      dismiss: jest.fn(),
    };
    const enrichment = { enrichLater: jest.fn() };
    const tool = new AddRecommendedWordsTool(lists as never, enrichment as never);

    const res = await tool.handle({ words: ['Layover'], all: false, dismiss: false }, ctx());

    expect(lists.accept).toHaveBeenCalledWith(expect.anything(), ['i2']);
    expect(enrichment.enrichLater).toHaveBeenCalledWith(['layover'], 's1');
    expect(res.data).toMatchObject({ added: [{ word: 'layover' }] });
  });

  it('dismisses everything when asked', async () => {
    const lists = {
      recommendedFor: jest.fn().mockResolvedValue(recs),
      accept: jest.fn(),
      dismiss: jest.fn().mockResolvedValue(2),
    };
    const tool = new AddRecommendedWordsTool(lists as never, { enrichLater: jest.fn() } as never);
    const res = await tool.handle({ words: [], all: true, dismiss: true }, ctx());
    expect(lists.dismiss).toHaveBeenCalledWith(expect.anything(), 'all');
    expect(lists.accept).not.toHaveBeenCalled();
    expect(res.data).toEqual({ dismissed: 2 });
  });
});
