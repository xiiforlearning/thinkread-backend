import { ListeningMethod } from '../groups/level';

/** Field names as the model sees them (snake_case) — returned in `missing_fields`. */
export type ListeningField =
  | 'source_title'
  | 'episode'
  | 'first_pass_pct'
  | 'second_pass_pct'
  | 'listen_count'
  | 'retelling';

export interface ListeningReportInput {
  sourceTitle: string | null;
  episode: string | null;
  firstPassPct: number | null;
  secondPassPct: number | null;
  listenCount: number | null;
  retelling: string | null;
  unclearParts: string[];
  newWords: string[];
}

/** A retelling shorter than this is a title, not "2–3 sentences in your own words". */
export const MIN_RETELLING_CHARS = 40;

/**
 * What a listening report must contain, per method. The retelling is the main
 * barrier against reporting content that was never heard, so it is mandatory
 * wherever there is no transcript to copy from.
 */
const REQUIRED: Record<ListeningMethod, readonly ListeningField[]> = {
  [ListeningMethod.PODCAST_WITH_SCRIPT]: [
    'source_title',
    'first_pass_pct',
    'second_pass_pct',
    'listen_count',
  ],
  [ListeningMethod.SERIES]: [
    'source_title',
    'episode',
    'first_pass_pct',
    'listen_count',
    'retelling',
  ],
  [ListeningMethod.PODCAST_NO_TRANSCRIPT]: ['source_title', 'first_pass_pct', 'retelling'],
};

export function requiredListeningFields(method: ListeningMethod): readonly ListeningField[] {
  return REQUIRED[method];
}

function present(field: ListeningField, input: ListeningReportInput): boolean {
  switch (field) {
    case 'source_title':
      return (input.sourceTitle ?? '').trim().length > 0;
    case 'episode':
      return (input.episode ?? '').trim().length > 0;
    case 'first_pass_pct':
      return input.firstPassPct !== null;
    case 'second_pass_pct':
      return input.secondPassPct !== null;
    case 'listen_count':
      return input.listenCount !== null;
    case 'retelling':
      return (input.retelling ?? '').trim().length >= MIN_RETELLING_CHARS;
  }
}

/** Required fields the input does not provide (in the order the model should ask for them). */
export function missingListeningFields(
  method: ListeningMethod,
  input: ListeningReportInput,
): ListeningField[] {
  return REQUIRED[method].filter((f) => !present(f, input));
}
