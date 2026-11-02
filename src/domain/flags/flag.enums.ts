/** Quiet flags: a note for the teacher only — never shown to the student, no automatic action. */
export enum FlagKind {
  /** Text far above the student's usual level. */
  STYLE_MISMATCH = 'STYLE_MISMATCH',
  /** Too smooth / formal, no personal details — looks generated. */
  TOO_POLISHED = 'TOO_POLISHED',
  /** Sharp jump in self-assessed comprehension without explanation. */
  PCT_JUMP = 'PCT_JUMP',
  GENERIC_RETELLING = 'GENERIC_RETELLING',
  REPEATED_RETELLING = 'REPEATED_RETELLING',
  FORWARDED = 'FORWARDED',
  SPOT_CHECK_FAILED = 'SPOT_CHECK_FAILED',
  /** Not one of the 6 weekly reports handed in — "reason for a presentation" (customer's rule). */
  NORM_MISSED_WEEK = 'NORM_MISSED_WEEK',
}

export enum FlagStatus {
  NEW = 'NEW',
  REVIEWED = 'REVIEWED',
  /** False alarm — also feedback for tuning the authenticity prompt. */
  DISMISSED = 'DISMISSED',
}

export enum SpotCheckVerdict {
  OK = 'OK',
  VAGUE = 'VAGUE',
  WRONG = 'WRONG',
  NO_ANSWER = 'NO_ANSWER',
}

/** One cited statement of a flag: what the check claims and the student's words it rests on. */
export interface FlagClaim {
  statement: string;
  /** Exact fragment of the flagged report (verified by code before the flag is stored). */
  quote: string;
  /** For REPEATED_RETELLING: the matching fragment of the earlier report. */
  previousQuote?: string;
}

/** Measured language signals of a report's prose; stored per report and compared with history. */
export interface ReportMetrics {
  words: number;
  /** Spelling / grammar slips per 100 words of prose, counted from quotes verified in the text. */
  errorsPer100: number;
  /** Constructions or vocabulary above the student's level, quotes verified in the text. */
  advanced: number;
}

/**
 * Everything a flag card shows besides the one-line reasons: per-kind reasons and claims, the
 * numbers behind a style flag and the history they were compared with.
 */
export interface FlagDetails {
  reasons?: Partial<Record<FlagKind, string>>;
  claims?: Partial<Record<FlagKind, FlagClaim[]>>;
  metrics?: ReportMetrics;
  baseline?: { reports: number; errorsPer100: number; advanced: number };
  /** Verified error quotes of the flagged report (what "errorsPer100" counted). */
  errors?: string[];
  /** Verified above-level fragments. */
  advancedQuotes?: string[];
}
