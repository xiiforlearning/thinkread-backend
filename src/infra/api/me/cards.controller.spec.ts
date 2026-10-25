import { QueueItem } from '../../../domain/cards/cards.service';
import { Word } from '../../../domain/words/word.entity';
import { CardStage, WordPriority } from '../../../domain/words/word.enums';
import { queueCounts, queueEntryView } from './cards.controller';

function item(over: Partial<Word>, overdue = false): QueueItem {
  const word = Object.assign(new Word(), {
    id: 'w',
    word: 'postpone',
    translation: 'откладывать',
    stage: CardStage.TRANSLATION,
    priority: WordPriority.NORMAL,
    nextDueAt: new Date('2026-10-20T00:00:00Z'),
    ...over,
  });
  return { word, overdue, reason: overdue ? 'OVERDUE' : 'DUE' };
}

describe('cards queue views', () => {
  it('the cards screen gets numbers only', () => {
    const counts = queueCounts([
      item({ id: 'a' }, true),
      item({ id: 'b', priority: WordPriority.HIGH }),
      item({ id: 'c' }),
    ]);
    expect(counts).toEqual({ due: 3, overdue: 1, priority: 1 });
  });

  it('the queue screen never shows the answer of a stage 1–2 card', () => {
    expect(queueEntryView(item({}))).toMatchObject({ label: 'откладывать', word: null, stage: 1 });
    expect(queueEntryView(item({ stage: CardStage.GAP, translation: null }))).toMatchObject({
      label: '…',
      word: null,
    });
    expect(queueEntryView(item({ stage: CardStage.OWN_SENTENCE }))).toMatchObject({
      label: 'postpone',
      word: 'postpone',
      stage: 3,
    });
  });
});
