export enum StudentStatus {
  /** Passed the membership check, has not given a real first and last name yet. */
  PENDING_NAME = 'PENDING_NAME',
  ACTIVE = 'ACTIVE',
  /** Access suspended; all history is kept. */
  ARCHIVED = 'ARCHIVED',
}

/** Groundwork for a future sales funnel; v1 only creates STUDENT. */
export enum StudentKind {
  STUDENT = 'STUDENT',
  LEAD = 'LEAD',
}

export enum ArchiveReason {
  /** Set by the monthly membership check; lifted automatically on return. */
  LEFT_GROUP = 'LEFT_GROUP',
  /** Set by the owner/teacher ("delete" = archive); never lifted automatically. */
  MANUAL = 'MANUAL',
}

/** Interface language of the Mini App and the bot's texts; null = not chosen yet (Russian). */
export enum StudentLanguage {
  RU = 'ru',
  EN = 'en',
}

/** Per-student conversation state kept between messages (not a command FSM). */
export interface DialogState {
  /** ISO timestamp: soften and thin out reminders until then (the norm itself is unchanged). */
  tiredUntil?: string;
  /** Consecutive off-topic messages, for the soft cap. */
  offTopicCount?: number;
  /** Card attempt currently waiting for an answer in the chat. */
  pendingCardAttemptId?: string;
  /** Bulk word import waiting for confirmation. */
  pendingWordImportId?: string;
  /** Spot check to weave into the next conversation. */
  pendingSpotCheckId?: string;
  /** Report in progress in the Mini App: being clarified, or waiting for the word list to be confirmed. */
  reportDraft?: ReportDraft;
}

export interface DraftWord {
  word: string;
  translation: string | null;
  /** Already in the vocabulary — shown, not added. */
  duplicate: boolean;
}

/**
 * A report is saved only when the student confirms its word list (customer decision
 * 02.11.2026): CLARIFY = fields are missing, one question is open; CONFIRM_WORDS = the fields
 * are complete, the extracted list waits on the confirmation screen. Nothing counts before that.
 */
export interface ReportDraft {
  id: string;
  type: 'READING' | 'LISTENING';
  /** Everything the student wrote so far, joined. */
  text: string;
  missingFields: string[];
  createdAt: string;
  stage?: 'CLARIFY' | 'CONFIRM_WORDS';
  /** CONFIRM_WORDS: the parsed fields, saved as they are on confirmation. */
  parsed?: Record<string, unknown>;
  /** CONFIRM_WORDS: the student's explicit list as extracted. */
  words?: DraftWord[];
  hasList?: boolean;
  /** Words beyond the per-report cap that were left out of the list. */
  droppedWords?: number;
}
