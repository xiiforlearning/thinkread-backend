/** Review-queue priority: HIGH words come right after overdue ones. Manually added and teacher-list words are HIGH. */
export enum WordPriority {
  HIGH = 'HIGH',
  NORMAL = 'NORMAL',
}

export enum WordStatus {
  LEARNING = 'LEARNING',
  /** Kept in the vocabulary, excluded from cards; can be returned to LEARNING. */
  LEARNED = 'LEARNED',
}

export enum WordSource {
  READING = 'READING',
  PODCAST = 'PODCAST',
  SERIES = 'SERIES',
  MANUAL = 'MANUAL',
  IMPORT = 'IMPORT',
  /** Imported by a teacher for the whole group. */
  TEACHER = 'TEACHER',
}

export enum CefrLevel {
  A1 = 'A1',
  A2 = 'A2',
  B1 = 'B1',
  B2 = 'B2',
  C1 = 'C1',
  C2 = 'C2',
}

/** Card stages: 1 translation → 2 fill the gap → 3 own sentence. */
export enum CardStage {
  TRANSLATION = 1,
  GAP = 2,
  OWN_SENTENCE = 3,
}

/** Who a teacher's word list is for. */
export enum WordListScope {
  GROUP = 'GROUP',
  LEVEL = 'LEVEL',
  ALL = 'ALL',
}

export enum WordListStatus {
  ACTIVE = 'ACTIVE',
  CLOSED = 'CLOSED',
}

export enum ImportStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
}
