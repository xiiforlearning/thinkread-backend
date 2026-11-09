import { Student } from '../students/student.entity';
import { Word } from './word.entity';
import { CardStage, WordPriority, WordSource, WordStatus } from './word.enums';
import { WordsService } from './words.service';

/** A repository that answers the two queries addWords makes and records saves. */
function make(owned: Partial<Word>[]): { svc: WordsService; saved: Word[] } {
  const saved: Word[] = [];
  const qb = {
    where: () => qb,
    andWhere: () => qb,
    select: () => qb,
    addSelect: () => qb,
    groupBy: () => qb,
    getMany: async () => owned,
    getOne: async () => owned[0] ?? null,
    getRawMany: async () => [],
  };
  const repo = {
    createQueryBuilder: () => qb,
    create: (x: Partial<Word>) => x,
    save: async (x: Word | Word[]) => {
      const rows = Array.isArray(x) ? x : [x];
      saved.push(...rows);
      return x;
    },
    find: async () => [],
  };
  const lexicon = { findMany: async () => new Map() };
  return { svc: new WordsService(repo as never, lexicon as never), saved };
}

describe('WordsService (W5: removal)', () => {
  const student = { id: 's1' } as Student;

  it('remove() sets REMOVED and keeps the row', async () => {
    const { svc, saved } = make([]);
    const word = { id: 'w1', studentId: 's1', word: 'owl', status: WordStatus.LEARNING } as Word;
    const res = await svc.remove(word);
    expect(res.status).toBe(WordStatus.REMOVED);
    expect(saved).toHaveLength(1);
    // idempotent
    await svc.remove(res);
    expect(saved).toHaveLength(1);
  });

  it('adding a removed word again revives it as a fresh LEARNING word', async () => {
    const removed = {
      id: 'w1',
      studentId: 's1',
      word: 'owl',
      lemma: 'owl',
      translation: 'сова',
      status: WordStatus.REMOVED,
      stage: CardStage.OWN_SENTENCE,
      stageCorrect: 1,
      correctTotal: 5,
      priority: WordPriority.NORMAL,
      source: WordSource.READING,
    } as Word;
    const { svc, saved } = make([removed]);
    const res = await svc.addWords(student, [{ word: 'owl' }], { source: WordSource.MANUAL });
    expect(res.added.map((w) => w.word)).toEqual(['owl']);
    expect(res.existing).toHaveLength(0);
    const w = saved[0];
    expect(w.status).toBe(WordStatus.LEARNING);
    expect(w.stage).toBe(CardStage.TRANSLATION);
    expect(w.correctTotal).toBe(0);
    expect(w.translation).toBe('сова');
    expect(w.priority).toBe(WordPriority.HIGH);
    expect(w.source).toBe(WordSource.MANUAL);
  });

  it('a word the student already has (not removed) is reported as existing', async () => {
    const have = {
      id: 'w1',
      studentId: 's1',
      word: 'owl',
      lemma: 'owl',
      status: WordStatus.LEARNING,
    } as Word;
    const { svc, saved } = make([have]);
    const res = await svc.addWords(student, [{ word: 'owl' }], { source: WordSource.MANUAL });
    expect(res.added).toHaveLength(0);
    expect(res.existing.map((w) => w.id)).toEqual(['w1']);
    expect(saved).toHaveLength(0);
  });

  it('edit() fixes the spelling and the translation, recomputes the lemma and refuses a duplicate', async () => {
    const { svc, saved } = make([]);
    const word = {
      id: 'w1',
      studentId: 's1',
      word: 'Soppose',
      lemma: 'soppose',
      translation: 'предполагать',
      example: 'old example',
      cefr: 'B1',
      status: WordStatus.LEARNING,
    } as Word;
    const res = await svc.edit(word, { word: 'suppose', translation: 'полагать' });
    expect(res.word).toBe('suppose');
    expect(res.lemma).toBe('suppose');
    expect(res.translation).toBe('полагать');
    expect(res.example).toBeNull();
    expect(saved).toHaveLength(1);

    await expect(svc.edit(word, { word: 'предположить' })).rejects.toMatchObject({
      code: expect.stringMatching(/001$/),
    });

    const { svc: svc2 } = make([{ id: 'w2', studentId: 's1', word: 'guess', lemma: 'guess' }]);
    await expect(svc2.edit(word, { word: 'guess' })).rejects.toMatchObject({
      code: expect.stringMatching(/250$/),
    });
  });
});
