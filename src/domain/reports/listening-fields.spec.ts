import { ListeningMethod } from '../groups/level';
import { ListeningReportInput, missingListeningFields } from './listening-fields';

const empty: ListeningReportInput = {
  sourceTitle: null,
  episode: null,
  firstPassPct: null,
  secondPassPct: null,
  listenCount: null,
  retelling: null,
  unclearParts: [],
  newWords: [],
};

describe('missingListeningFields', () => {
  it('needs both passes and the count for a podcast with a script, no retelling', () => {
    expect(missingListeningFields(ListeningMethod.PODCAST_WITH_SCRIPT, empty)).toEqual([
      'source_title',
      'first_pass_pct',
      'second_pass_pct',
      'listen_count',
    ]);
    expect(
      missingListeningFields(ListeningMethod.PODCAST_WITH_SCRIPT, {
        ...empty,
        sourceTitle: '6 Minute English',
        firstPassPct: 60,
        secondPassPct: 85,
        listenCount: 3,
      }),
    ).toEqual([]);
  });

  it('needs the episode and a retelling for series', () => {
    expect(
      missingListeningFields(ListeningMethod.SERIES, {
        ...empty,
        sourceTitle: 'Friends',
        firstPassPct: 70,
        listenCount: 2,
      }),
    ).toEqual(['episode', 'retelling']);
  });

  it('treats a retelling that is too short as missing', () => {
    expect(
      missingListeningFields(ListeningMethod.PODCAST_NO_TRANSCRIPT, {
        ...empty,
        sourceTitle: 'Huberman Lab',
        firstPassPct: 80,
        retelling: 'about sleep',
      }),
    ).toEqual(['retelling']);
    expect(
      missingListeningFields(ListeningMethod.PODCAST_NO_TRANSCRIPT, {
        ...empty,
        sourceTitle: 'Huberman Lab',
        firstPassPct: 80,
        retelling:
          'The host explains why morning sunlight sets the body clock and suggests a short walk after waking.',
      }),
    ).toEqual([]);
  });

  it('ignores whitespace-only titles', () => {
    expect(
      missingListeningFields(ListeningMethod.PODCAST_NO_TRANSCRIPT, {
        ...empty,
        sourceTitle: '   ',
        firstPassPct: 80,
        retelling: 'x'.repeat(50),
      }),
    ).toEqual(['source_title']);
  });
});
