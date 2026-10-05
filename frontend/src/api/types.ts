/**
 * Shapes returned by the ThinkRead REST API (`src/infra/api/me/serializers.ts`
 * in the backend). Keep in sync by hand — the API is the source of truth.
 */

export type AccessStatus = 'NOT_MEMBER' | 'PENDING_NAME' | 'ACTIVE' | 'ARCHIVED';
export type ApiRole = 'STUDENT' | 'TEACHER' | 'OWNER';

export type GroupLevel =
  'PRE_INTERMEDIATE' | 'INTERMEDIATE' | 'UPPER_INTERMEDIATE' | 'ADVANCED' | 'IELTS';
export type ListeningMethod = 'PODCAST_WITH_SCRIPT' | 'SERIES' | 'PODCAST_NO_TRANSCRIPT';

export type ReportType = 'READING' | 'LISTENING';
export type WordStatus = 'LEARNING' | 'LEARNED';
export type WordPriority = 'HIGH' | 'NORMAL';
export type WordSource = 'READING' | 'PODCAST' | 'SERIES' | 'MANUAL' | 'IMPORT' | 'TEACHER';
export type Cefr = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

export interface WebAppAuth {
  status: AccessStatus;
  roles: ApiRole[];
  token: string | null;
  startParam: string | null;
}

export interface Profile {
  id: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string;
  username: string | null;
  status: string;
  level: GroupLevel | null;
  listeningMethod: ListeningMethod;
  retellingRequired: boolean;
  groups: Array<{ chatId: string; title: string; level: GroupLevel | null }>;
  calmMode: boolean;
  calmUntil: string | null;
  registeredAt: string | null;
}

export interface NormPart {
  done: number;
  norm: number;
}

export interface Week {
  weekStart: string;
  reading: NormPart;
  listening: NormPart;
}

export interface Progress {
  week: Week;
  cards: { done: number; norm: number; available: boolean };
  words: { total: number; learning: number; learned: number; priority: number };
}

export interface Word {
  id: string;
  word: string;
  translation: string | null;
  example: string | null;
  cefr: Cefr | null;
  status: WordStatus;
  stage: 1 | 2 | 3;
  priority: WordPriority;
  source: WordSource;
  sourceReportId: string | null;
  sourceListId: string | null;
  nextDueAt: string | null;
  createdAt: string;
  learnedAt: string | null;
}

export interface WordsQuery {
  q?: string;
  status?: WordStatus;
  cefr?: Cefr;
  source?: WordSource;
  priority?: WordPriority;
  limit?: number;
  cursor?: string;
}

export interface VocabularySummary {
  total: number;
  learning: number;
  learned: number;
  priority: number;
  byCefr: Record<string, number>;
  bySource: Record<string, number>;
}

export interface ImportItem {
  word: string;
  translation: string | null;
  duplicate: boolean;
}

export interface ImportPreview {
  importId: string;
  found: number;
  duplicates: number;
  toAdd: number;
  items: ImportItem[];
}

export type AddWordsResult =
  | ({ preview: true } & ImportPreview)
  | { preview: false; added: Word[]; alreadyHad: Word[]; alreadyLearned: Word[] };

export interface Report {
  id: string;
  type: ReportType;
  method: ListeningMethod | null;
  sourceTitle: string | null;
  episode: string | null;
  pages: number | null;
  summary: string | null;
  firstPassPct: number | null;
  secondPassPct: number | null;
  listenCount: number | null;
  unclearParts: string | null;
  wordsAdded: string[];
  weekStart: string;
  createdAt: string;
}

export interface ReportPatch {
  sourceTitle?: string;
  episode?: string;
  pages?: number;
  summary?: string;
  firstPassPct?: number;
  secondPassPct?: number;
  listenCount?: number;
}

export type IntakeResult =
  | { status: 'CLARIFY'; draftId: string; missingFields: string[]; question: string }
  | {
      status: 'SAVED';
      report: Report;
      weekProgress: Week;
      words: { added: number; existing: number };
    };

export interface Recommendation {
  list: { id: string; title: string };
  items: Array<{ id: string; word: string; translation: string | null }>;
}

export interface SpotCheck {
  id: string;
  question: string;
  sourceTitle: string | null;
}

export interface Page<T> {
  data: T[];
  meta: { nextCursor: string | null };
}

/** `{ error: { code, message, details } }` from the API, or a transport failure. */
export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** `{level}{service}{error}` — the last three digits are the error code. */
  get errorCode(): string {
    return this.code.slice(-3);
  }
}

/** Error codes (last three digits of `{level}{service}{error}`) the UI reacts to. */
export const ERR = {
  NOT_FOUND: '002',
  DAILY_LIMIT: '260',
  NAME_INVALID: '261',
  IMPORT_EXPIRED: '258',
  AI_UNAVAILABLE: '310',
  AI_RATE_LIMITED: '311',
  TOO_MANY_REQUESTS: '951',
  INVALID_TOKEN: '952',
  INIT_DATA_INVALID: '953',
  INIT_DATA_EXPIRED: '954',
} as const;
