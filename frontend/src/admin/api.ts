/**
 * Dashboard API: shapes returned by `/admin/*` (backend `infra/api/admin/serializers.ts`)
 * and the two implementations — `HttpAdminApi` (real backend, JWT from the Telegram Login
 * Widget) and `MockAdminApi` (mock.ts, the demo). Keep the types in sync by hand.
 */
import {
  ApiError,
  type ApiRole,
  type GroupLevel,
  type Report,
  type VocabularySummary,
  type Week,
  type Word,
} from '../api/types';

export type Health = 'good' | 'warn' | 'bad';
export type StudentStatus = 'PENDING_NAME' | 'ACTIVE' | 'ARCHIVED';
export type FlagKind =
  | 'STYLE_MISMATCH'
  | 'TOO_POLISHED'
  | 'PCT_JUMP'
  | 'GENERIC_RETELLING'
  | 'REPEATED_RETELLING'
  | 'FORWARDED'
  | 'SPOT_CHECK_FAILED'
  | 'NORM_MISSED_WEEK';
export type FlagStatus = 'NEW' | 'REVIEWED' | 'DISMISSED';
export type WordListScope = 'GROUP' | 'LEVEL' | 'ALL';
export type WordListStatus = 'ACTIVE' | 'CLOSED';
export type StaffRole = 'OWNER' | 'TEACHER';

export interface GroupRef {
  chatId: number;
  title: string;
}

export interface StudentRef {
  id: string;
  name: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  username: string | null;
  status: StudentStatus;
  level: GroupLevel | null;
  groups: GroupRef[];
}

export interface WeekCounts {
  reading: number;
  listening: number;
  readingNorm: number;
  listeningNorm: number;
}

export interface StudentRow extends StudentRef {
  health: Health;
  silentDays: number;
  dmBlocked: boolean;
  lastActivityAt: string | null;
  registeredAt: string;
  week: WeekCounts;
  words: { total: number; learned: number };
  newFlags: number;
}

export interface StudentDetail extends StudentRef {
  telegramUserId: number;
  health: Health;
  silentDays: number;
  dmBlocked: boolean;
  manualAccess: boolean;
  archiveReason: string | null;
  archivedAt: string | null;
  calmUntil: string | null;
  lastActivityAt: string | null;
  registeredAt: string;
}

export interface AdminReport extends Report {
  rawText?: string;
  isForwarded?: boolean;
}

export interface FlagView {
  id: string;
  kind: FlagKind;
  status: FlagStatus;
  reason: string | null;
  createdAt: string;
  reviewedAt: string | null;
  student: StudentRef | null;
  report: AdminReport | null;
}

export interface FlagDetail extends FlagView {
  previousReports: AdminReport[];
}

export interface StudentCard {
  student: StudentDetail;
  calendar: Week[];
  words: VocabularySummary;
  flags: FlagView[];
  recentReports: Report[];
  canEdit: boolean;
}

export interface RecheckResult extends StudentCard {
  action: string;
  levelChanged: boolean;
  failedGroups: number[];
}

export interface Overview {
  weekStart: string;
  generatedAt: string;
  stats: {
    activeStudents: number;
    archivedStudents: number;
    groups: number;
    readingRate: number;
    readingRateDelta: number;
    listeningRate: number;
    listeningRateDelta: number;
    cardsThisWeek: number;
    newFlags: number;
  };
  healthByGroup: Array<{
    chatId: number;
    title: string;
    level: GroupLevel | null;
    good: number;
    warn: number;
    bad: number;
    members: number;
  }>;
  healthTotals: { good: number; warn: number; bad: number };
  history: Array<{ weekStart: string; reading: number; listening: number; students: number }>;
  topReaders: Array<StudentRef & { pages: number; reports: number }>;
  attention: Array<
    StudentRef & {
      health: Health;
      silentDays: number;
      dmBlocked: boolean;
      noReportsForWeeks: number;
      week: WeekCounts;
    }
  >;
}

export interface GroupView {
  chatId: number;
  title: string;
  level: GroupLevel | null;
  isActive: boolean;
  members: number;
  teachers: Array<{ telegramUserId: number; name: string | null }>;
  teachersRefreshedAt: string | null;
  week: { reading: number; listening: number; students: number } | null;
  createdAt: string;
}

export interface MembershipCheck {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  checked: number;
  archived: number;
  restored: number;
  levelChanged: number;
  failedGroups: number[];
}

export interface ListCoverage {
  studentsAddressed: number;
  words: number;
  studentsAdded: number;
  wordsAdded: number;
  wordsLearned: number;
  studentsHidden: number;
}

export interface WordListView {
  id: string;
  title: string;
  scope: WordListScope;
  group: GroupRef | null;
  level: GroupLevel | null;
  status: WordListStatus;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
  coverage: ListCoverage | null;
  items?: Array<{ id: string; word: string; translation: string | null }>;
}

export interface CreateWordList {
  title: string;
  scope: WordListScope;
  groupChatId?: number;
  level?: GroupLevel;
  text: string;
}

export interface SettingView {
  key: string;
  value: unknown;
  default: unknown;
  overridden: boolean;
  updatedAt: string | null;
}

export interface StaffMember {
  telegramUserId: number;
  name: string | null;
  role: StaffRole;
  granted: boolean;
  groups: GroupRef[];
}

export interface AiUsage {
  month: string;
  costUsd: number;
  tokens: number;
  calls: number;
  perActiveStudentUsd: number;
  byPurpose: Array<{ purpose: string; costUsd: number; tokens: number; calls: number }>;
  topStudents: Array<{ studentId: string; name: string | null; costUsd: number; tokens: number }>;
}

export interface TelegramLoginPayload {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

export interface StudentsQuery {
  q?: string;
  health?: Health;
  status?: StudentStatus;
  groupChatId?: number;
}

export interface Page<T> {
  data: T[];
  meta: { nextCursor: string | null };
}

export interface ChatReply {
  text: string;
  /** A draft the teacher can copy (feedback for the student, parents' report). */
  copyable: boolean;
}

export interface ChatTurn {
  role: 'teacher' | 'ai';
  text: string;
}

export interface ReminderRun {
  kind: 'CARDS' | 'REPORTS';
  day: string;
  candidates: number;
  sent: number;
  skipped: { calm: number; done: number; reminded: number; failed: number; notReportDay: number };
}

export interface WeeklySummary {
  weekStart: string;
  weekLabel: string;
  students: number;
  readingRate: number;
  readingRateDelta: number;
  listeningRate: number;
  listeningRateDelta: number;
  cardsAnswered: number;
  health: { good: number; warn: number; bad: number };
  groups: Array<{
    chatId: number;
    title: string;
    students: number;
    readingRate: number;
    listeningRate: number;
  }>;
  missed: Array<{ id: string; name: string; groups: string; silentDays: number }>;
  topReaders: Array<{ id: string; name: string; groups: string; pages: number }>;
  newFlags: number;
  /** The Telegram text as the owner / teacher would receive it. */
  text: string;
}

export interface AdminApi {
  /** Stage 8 features the backend does not serve yet; the demo has them. */
  readonly features: { teacherChat: boolean; parentReport: boolean };
  auth: {
    telegramLogin(payload: TelegramLoginPayload): Promise<{ token: string; roles: ApiRole[] }>;
  };
  overview(week: 'this' | 'last'): Promise<Overview>;
  students: {
    list(query: StudentsQuery): Promise<StudentRow[]>;
    one(id: string): Promise<StudentCard>;
    reports(id: string, limit: number, cursor?: string): Promise<Page<AdminReport>>;
    words(id: string): Promise<Word[]>;
    rename(id: string, displayName: string | null): Promise<StudentCard>;
    archive(id: string): Promise<StudentCard>;
    restore(id: string): Promise<StudentCard>;
    recheck(id: string): Promise<RecheckResult>;
  };
  flags: {
    list(query: { status?: FlagStatus; kind?: FlagKind; studentId?: string }): Promise<FlagView[]>;
    one(id: string): Promise<FlagDetail>;
    review(id: string, status: 'REVIEWED' | 'DISMISSED'): Promise<FlagView>;
  };
  groups: {
    list(): Promise<GroupView[]>;
    setLevel(chatId: number, level: GroupLevel): Promise<GroupView>;
    membershipChecks(): Promise<MembershipCheck[]>;
    runCheck(): Promise<{ started: boolean; alreadyRunning: boolean }>;
  };
  wordLists: {
    list(): Promise<WordListView[]>;
    create(dto: CreateWordList): Promise<WordListView>;
    one(id: string): Promise<WordListView>;
    patch(
      id: string,
      patch: { title?: string; status?: WordListStatus; text?: string },
    ): Promise<WordListView>;
  };
  settings: {
    get(): Promise<{ keys: string[]; settings: SettingView[] }>;
    update(values: Record<string, unknown>): Promise<{ settings: SettingView[] }>;
    reset(key: string): Promise<{ settings: SettingView[] }>;
  };
  staff: {
    list(): Promise<StaffMember[]>;
    grant(dto: {
      telegramUserId: number;
      role?: StaffRole;
      name?: string | null;
    }): Promise<StaffMember[]>;
    revoke(telegramUserId: number): Promise<StaffMember[]>;
  };
  aiUsage(month?: string): Promise<AiUsage>;
  ai: {
    /** Teacher's per-student chat (AiPurpose.TEACHER_CHAT). */
    ask(studentId: string, question: string, history: ChatTurn[]): Promise<ChatReply>;
    /** Parents' report for the current month (AiPurpose.PARENT_REPORT). */
    parentReport(studentId: string): Promise<ChatReply>;
  };
  ops: {
    /** Owner: send today's reminders now. */
    runReminders(kind: 'CARDS' | 'REPORTS'): Promise<ReminderRun>;
    weeklySummary(week: 'this' | 'last'): Promise<WeeklySummary>;
    /** Owner: flag last week's no-shows and send the summary now. */
    runWeeklySummary(): Promise<{ summary: WeeklySummary; flagged: number; sentTo: number[] }>;
  };
}

type TokenSource = () => string | null;

export class HttpAdminApi implements AdminApi {
  readonly features = { teacherChat: true, parentReport: true };

  constructor(
    private readonly baseUrl: string,
    private readonly token: TokenSource,
    private readonly onUnauthorized?: () => void,
  ) {}

  private async call<T>(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, unknown>,
  ): Promise<T> {
    const url = new URL(this.baseUrl + path, window.location.origin);
    if (query)
      for (const [k, v] of Object.entries(query))
        if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const token = this.token();
    if (token) headers.Authorization = `Bearer ${token}`;

    let res: Response;
    try {
      res = await fetch(url.toString(), {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiError('NETWORK', 'Нет связи с сервером. Проверьте адрес API и сеть.', 0);
    }
    const text = await res.text();
    let json: unknown = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }
    if (!res.ok) {
      const err = (
        json as { error?: { code?: string; message?: string; details?: unknown } } | null
      )?.error;
      if (res.status === 401) this.onUnauthorized?.();
      throw new ApiError(
        err?.code ?? String(res.status),
        err?.message ?? `Ошибка ${res.status}`,
        res.status,
        err?.details,
      );
    }
    const envelope = json as { data?: T; meta?: unknown } | null;
    if (envelope && typeof envelope === 'object' && 'meta' in envelope) return envelope as T;
    return (envelope?.data ?? null) as T;
  }

  auth: AdminApi['auth'] = {
    telegramLogin: (payload) => this.call('POST', '/auth/telegram-login', payload),
  };

  overview: AdminApi['overview'] = (week) =>
    this.call('GET', '/admin/overview', undefined, { week });

  students: AdminApi['students'] = {
    list: (query) => this.call('GET', '/admin/students', undefined, { ...query }),
    one: (id) => this.call('GET', `/admin/students/${id}`),
    reports: (id, limit, cursor) =>
      this.call('GET', `/admin/students/${id}/reports`, undefined, { limit, cursor }),
    words: (id) => this.call('GET', `/admin/students/${id}/words`),
    rename: (id, displayName) => this.call('PATCH', `/admin/students/${id}`, { displayName }),
    archive: (id) => this.call('POST', `/admin/students/${id}/archive`),
    restore: (id) => this.call('POST', `/admin/students/${id}/restore`),
    recheck: (id) => this.call('POST', `/admin/students/${id}/recheck`),
  };

  flags: AdminApi['flags'] = {
    list: (query) => this.call('GET', '/admin/flags', undefined, { ...query }),
    one: (id) => this.call('GET', `/admin/flags/${id}`),
    review: (id, status) => this.call('POST', `/admin/flags/${id}/review`, { status }),
  };

  groups: AdminApi['groups'] = {
    list: () => this.call('GET', '/admin/groups'),
    setLevel: (chatId, level) => this.call('PATCH', `/admin/groups/${chatId}`, { level }),
    membershipChecks: () => this.call('GET', '/admin/membership-checks'),
    runCheck: () => this.call('POST', '/admin/membership-checks/run'),
  };

  wordLists: AdminApi['wordLists'] = {
    list: () => this.call('GET', '/admin/word-lists'),
    create: (dto) => this.call('POST', '/admin/word-lists', dto),
    one: (id) => this.call('GET', `/admin/word-lists/${id}`),
    patch: (id, patch) => this.call('PATCH', `/admin/word-lists/${id}`, patch),
  };

  settings: AdminApi['settings'] = {
    get: () => this.call('GET', '/admin/settings'),
    update: (values) => this.call('PATCH', '/admin/settings', { values }),
    reset: (key) => this.call('DELETE', `/admin/settings/${encodeURIComponent(key)}`),
  };

  staff: AdminApi['staff'] = {
    list: () => this.call('GET', '/admin/staff'),
    grant: (dto) => this.call('POST', '/admin/staff', dto),
    revoke: (telegramUserId) => this.call('DELETE', `/admin/staff/${telegramUserId}`),
  };

  aiUsage: AdminApi['aiUsage'] = (month) =>
    this.call('GET', '/admin/ai-usage', undefined, { month });

  ai: AdminApi['ai'] = {
    ask: async (studentId, question, history) => {
      const r = await this.call<{ text: string; draft: boolean }>(
        'POST',
        `/admin/students/${studentId}/chat`,
        { question, history },
      );
      return { text: r.text, copyable: r.draft };
    },
    parentReport: async (studentId) => {
      const r = await this.call<{ text: string }>(
        'POST',
        `/admin/students/${studentId}/parent-report`,
        {},
      );
      return { text: r.text, copyable: true };
    },
  };

  ops: AdminApi['ops'] = {
    runReminders: (kind) => this.call('POST', '/admin/reminders/run', { kind }),
    weeklySummary: (week) => this.call('GET', '/admin/weekly-summary', undefined, { week }),
    runWeeklySummary: () => this.call('POST', '/admin/weekly-summary/run'),
  };
}
