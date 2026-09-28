import {
  DEFAULT_LISTENING_METHOD,
  GroupLevel,
  ListeningMethod,
  highestLevel,
  listeningMethodFor,
  requiresRetelling,
} from './level';

describe('highestLevel', () => {
  it('returns null when no group has a level', () => {
    expect(highestLevel([])).toBeNull();
    expect(highestLevel([null, null])).toBeNull();
  });

  it('ignores groups without a level', () => {
    expect(highestLevel([null, GroupLevel.INTERMEDIATE])).toBe(GroupLevel.INTERMEDIATE);
  });

  it('picks the higher level for a student in several groups', () => {
    expect(highestLevel([GroupLevel.PRE_INTERMEDIATE, GroupLevel.UPPER_INTERMEDIATE])).toBe(
      GroupLevel.UPPER_INTERMEDIATE,
    );
    expect(highestLevel([GroupLevel.ADVANCED, GroupLevel.INTERMEDIATE])).toBe(GroupLevel.ADVANCED);
  });

  it('keeps the first level on a rank tie (ADVANCED vs IELTS)', () => {
    expect(highestLevel([GroupLevel.IELTS, GroupLevel.ADVANCED])).toBe(GroupLevel.IELTS);
    expect(highestLevel([GroupLevel.ADVANCED, GroupLevel.IELTS])).toBe(GroupLevel.ADVANCED);
  });
});

describe('listeningMethodFor', () => {
  it.each([
    [GroupLevel.PRE_INTERMEDIATE, ListeningMethod.PODCAST_WITH_SCRIPT],
    [GroupLevel.INTERMEDIATE, ListeningMethod.SERIES],
    [GroupLevel.UPPER_INTERMEDIATE, ListeningMethod.PODCAST_NO_TRANSCRIPT],
    [GroupLevel.ADVANCED, ListeningMethod.PODCAST_NO_TRANSCRIPT],
    [GroupLevel.IELTS, ListeningMethod.PODCAST_NO_TRANSCRIPT],
  ])('%s → %s', (level, method) => {
    expect(listeningMethodFor(level)).toBe(method);
  });

  it('falls back to the default method when the level is unknown', () => {
    expect(listeningMethodFor(null)).toBe(DEFAULT_LISTENING_METHOD);
  });
});

describe('requiresRetelling', () => {
  it('is required only for methods without a transcript', () => {
    expect(requiresRetelling(ListeningMethod.PODCAST_WITH_SCRIPT)).toBe(false);
    expect(requiresRetelling(ListeningMethod.SERIES)).toBe(true);
    expect(requiresRetelling(ListeningMethod.PODCAST_NO_TRANSCRIPT)).toBe(true);
  });
});
