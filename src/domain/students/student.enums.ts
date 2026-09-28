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
}
