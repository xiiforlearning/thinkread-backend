import {
  type AddWordsResult,
  ApiError,
  type CardAnswer,
  type CardsState,
  type CardView,
  type TodayCards,
  type ImportPreview,
  type IntakeResult,
  type Page,
  type Profile,
  type Progress,
  type Recommendation,
  type Report,
  type ReportPatch,
  type ReportType,
  type SpotCheck,
  type VocabularySummary,
  type WebAppAuth,
  type Week,
  type Word,
  type WordPriority,
  type WordsQuery,
  type WordStatus,
} from './types';

/**
 * Everything the Mini App can do. `HttpApi` talks to the NestJS backend,
 * `MockApi` (mock.ts) keeps the same contract in memory for demos.
 */
export interface Api {
  auth: {
    webApp(initData: string): Promise<WebAppAuth>;
  };
  me: {
    get(): Promise<Profile>;
    register(firstName: string, lastName: string): Promise<Profile>;
    rename(firstName: string, lastName: string): Promise<Profile>;
    calmMode(on: boolean): Promise<Profile>;
    progress(): Promise<Progress>;
    calendar(weeks: number): Promise<Week[]>;
    recommendations(): Promise<Recommendation[]>;
    acceptRecommendations(
      itemIds: string[] | 'all',
    ): Promise<{ added: Word[]; alreadyHad: number }>;
    dismissRecommendations(itemIds: string[] | 'all'): Promise<{ dismissed: number }>;
    spotCheck(): Promise<SpotCheck | null>;
    answerSpotCheck(answer: string | null): Promise<void>;
  };
  words: {
    list(query: WordsQuery): Promise<Word[]>;
    summary(): Promise<VocabularySummary>;
    one(id: string): Promise<Word>;
    add(words: Array<{ word: string; translation?: string | null }>): Promise<AddWordsResult>;
    importText(text: string): Promise<ImportPreview>;
    confirmImport(id: string, excludeWords: string[]): Promise<{ added: number; words: Word[] }>;
    cancelImport(id: string): Promise<void>;
    patch(id: string, patch: { translation?: string; status?: WordStatus }): Promise<Word>;
    priority(id: string, priority: WordPriority): Promise<Word>;
    exportText(format: 'csv' | 'txt'): Promise<{ filename: string; content: string }>;
  };
  cards: {
    state(): Promise<CardsState>;
    next(): Promise<{ card: CardView | null; today: TodayCards }>;
    answer(attemptId: string, answer: string): Promise<CardAnswer>;
    giveUp(attemptId: string): Promise<CardAnswer>;
    skip(attemptId: string): Promise<{ today: TodayCards }>;
  };
  reports: {
    list(limit: number, cursor?: string): Promise<Page<Report>>;
    today(): Promise<Record<ReportType, boolean>>;
    submit(type: ReportType, text: string): Promise<IntakeResult>;
    clarify(draftId: string, text: string): Promise<IntakeResult>;
    patch(id: string, patch: ReportPatch): Promise<Report>;
  };
}

type TokenSource = () => string | null;

export class HttpApi implements Api {
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
      throw new ApiError(
        'NETWORK',
        'Нет связи с сервером. Проверь интернет и попробуй ещё раз.',
        0,
      );
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

  auth: Api['auth'] = {
    webApp: (initData) => this.call('POST', '/auth/webapp', { initData }),
  };

  me: Api['me'] = {
    get: () => this.call('GET', '/me'),
    register: (firstName, lastName) => this.call('POST', '/me/register', { firstName, lastName }),
    rename: (firstName, lastName) => this.call('PATCH', '/me', { firstName, lastName }),
    calmMode: (on) => this.call('POST', '/me/calm-mode', { on }),
    progress: () => this.call('GET', '/me/progress'),
    calendar: (weeks) => this.call('GET', '/me/calendar', undefined, { weeks }),
    recommendations: () => this.call('GET', '/me/recommendations'),
    acceptRecommendations: (ids) =>
      this.call(
        'POST',
        '/me/recommendations/accept',
        ids === 'all' ? { all: true } : { itemIds: ids },
      ),
    dismissRecommendations: (ids) =>
      this.call(
        'POST',
        '/me/recommendations/dismiss',
        ids === 'all' ? { all: true } : { itemIds: ids },
      ),
    spotCheck: () => this.call('GET', '/me/spot-check'),
    answerSpotCheck: async (answer) => {
      await this.call('POST', '/me/spot-check/answer', { answer });
    },
  };

  words: Api['words'] = {
    list: (query) => this.call('GET', '/me/words', undefined, { ...query }),
    summary: () => this.call('GET', '/me/words/summary'),
    one: (id) => this.call('GET', `/me/words/${id}`),
    add: (words) => this.call('POST', '/me/words', { words }),
    importText: (text) => this.call('POST', '/me/word-imports', { text }),
    confirmImport: (id, excludeWords) =>
      this.call('POST', `/me/word-imports/${id}/confirm`, { excludeWords }),
    cancelImport: async (id) => {
      await this.call('POST', `/me/word-imports/${id}/cancel`, {});
    },
    patch: (id, patch) => this.call('PATCH', `/me/words/${id}`, patch),
    priority: (id, priority) => this.call('PATCH', `/me/words/${id}/priority`, { priority }),
    exportText: (format) => this.call('GET', '/me/words/export', undefined, { format }),
  };

  cards: Api['cards'] = {
    state: () => this.call('GET', '/me/cards'),
    next: () => this.call('POST', '/me/cards/next', {}),
    answer: (attemptId, answer) => this.call('POST', `/me/cards/${attemptId}/answer`, { answer }),
    giveUp: (attemptId) => this.call('POST', `/me/cards/${attemptId}/give-up`, {}),
    skip: (attemptId) => this.call('POST', `/me/cards/${attemptId}/skip`, {}),
  };

  reports: Api['reports'] = {
    list: (limit, cursor) => this.call('GET', '/me/reports', undefined, { limit, cursor }),
    today: () => this.call('GET', '/me/reports/today'),
    submit: (type, text) => this.call('POST', '/me/reports', { type, text }),
    clarify: (draftId, text) => this.call('POST', `/me/reports/${draftId}/clarify`, { text }),
    patch: (id, patch) => this.call('PATCH', `/me/reports/${id}`, patch),
  };
}
