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
  NORM_MISSED_3_WEEKS = 'NORM_MISSED_3_WEEKS',
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
