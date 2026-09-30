/** Level of a Telegram group, set once by the owner per group (by chat id, not title). */
export enum GroupLevel {
  PRE_INTERMEDIATE = 'PRE_INTERMEDIATE',
  INTERMEDIATE = 'INTERMEDIATE',
  UPPER_INTERMEDIATE = 'UPPER_INTERMEDIATE',
  ADVANCED = 'ADVANCED',
  IELTS = 'IELTS',
}

export const GROUP_LEVELS: readonly GroupLevel[] = Object.values(GroupLevel);

/**
 * Higher rank wins when a student is in several groups. IELTS ranks with
 * ADVANCED (open question to the customer); ties keep the first level seen.
 */
const LEVEL_RANK: Record<GroupLevel, number> = {
  [GroupLevel.PRE_INTERMEDIATE]: 1,
  [GroupLevel.INTERMEDIATE]: 2,
  [GroupLevel.UPPER_INTERMEDIATE]: 3,
  [GroupLevel.ADVANCED]: 4,
  [GroupLevel.IELTS]: 4,
};

export function levelRank(level: GroupLevel): number {
  return LEVEL_RANK[level];
}

/** The highest level among the student's groups; null if none of them has a level yet. */
export function highestLevel(levels: ReadonlyArray<GroupLevel | null>): GroupLevel | null {
  let best: GroupLevel | null = null;
  for (const level of levels) {
    if (level === null) continue;
    if (best === null || levelRank(level) > levelRank(best)) best = level;
  }
  return best;
}

export enum ListeningMethod {
  /** Pre-Intermediate: podcast with a script, 6 steps. */
  PODCAST_WITH_SCRIPT = 'PODCAST_WITH_SCRIPT',
  /** Intermediate: Netflix / series, second watch without subtitles. */
  SERIES = 'SERIES',
  /** Upper-Intermediate / Advanced: podcasts with no transcript at all. */
  PODCAST_NO_TRANSCRIPT = 'PODCAST_NO_TRANSCRIPT',
}

/** Used while the student's groups have no level set yet. */
export const DEFAULT_LISTENING_METHOD = ListeningMethod.PODCAST_WITH_SCRIPT;

const METHOD_BY_LEVEL: Record<GroupLevel, ListeningMethod> = {
  [GroupLevel.PRE_INTERMEDIATE]: ListeningMethod.PODCAST_WITH_SCRIPT,
  [GroupLevel.INTERMEDIATE]: ListeningMethod.SERIES,
  [GroupLevel.UPPER_INTERMEDIATE]: ListeningMethod.PODCAST_NO_TRANSCRIPT,
  [GroupLevel.ADVANCED]: ListeningMethod.PODCAST_NO_TRANSCRIPT,
  [GroupLevel.IELTS]: ListeningMethod.PODCAST_NO_TRANSCRIPT,
};

export function listeningMethodFor(level: GroupLevel | null): ListeningMethod {
  return level === null ? DEFAULT_LISTENING_METHOD : METHOD_BY_LEVEL[level];
}

/**
 * Methods without a transcript require a short retelling in the student's own
 * words — the main barrier against reporting content that was never heard.
 */
export function requiresRetelling(method: ListeningMethod): boolean {
  return method !== ListeningMethod.PODCAST_WITH_SCRIPT;
}
