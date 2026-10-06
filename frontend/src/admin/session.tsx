import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';
import type { ApiRole } from '../api/types';
import { apiBaseUrl } from '../lib/api-url';
import { type AdminApi, HttpAdminApi, type TelegramLoginPayload } from './api';
import { MockAdminApi } from './mock';

const TOKEN_KEY = 'thinkread.admin.token';
const USER_KEY = 'thinkread.admin.user';
const DEMO_KEY = 'thinkread.admin.demo';

export interface StaffUser {
  name: string;
  role: 'OWNER' | 'TEACHER';
  telegramUserId: number | null;
}

/** Demo (in-memory data): `VITE_DEMO=1`, `?demo=1`, or the "Демо" button on the sign-in screen. */
function demoRequested(): boolean {
  if (import.meta.env.VITE_DEMO === '1') return true;
  const q = new URLSearchParams(window.location.search).get('demo');
  if (q !== null) return q !== '0';
  try {
    return localStorage.getItem(DEMO_KEY) === '1';
  } catch {
    return false;
  }
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function write(key: string, value: unknown): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode — the session just does not survive a reload */
  }
}

/** Roles and user id from the JWT payload (no signature check — the server verifies). */
function claimsOf(token: string): { telegramUserId: number | null; roles: ApiRole[] } {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return {
      telegramUserId: typeof payload.telegramUserId === 'number' ? payload.telegramUserId : null,
      roles: Array.isArray(payload.roles) ? payload.roles : [],
    };
  } catch {
    return { telegramUserId: null, roles: [] };
  }
}

export type SessionState =
  { kind: 'anonymous' } | { kind: 'signed-in'; user: StaffUser; demo: boolean };

interface SessionValue {
  api: AdminApi;
  state: SessionState;
  apiUrl: string;
  botUsername: string;
  /** Telegram Login Widget callback → POST /auth/telegram-login. */
  loginWithTelegram: (payload: TelegramLoginPayload) => Promise<void>;
  /** Developer path: a JWT from `pnpm dev:token owner|teacher <id>`. */
  loginWithToken: (token: string, name?: string) => void;
  startDemo: (role: 'OWNER' | 'TEACHER') => void;
  signOut: () => void;
}

const SessionContext = createContext<SessionValue | null>(null);

function initialState(): SessionState {
  const user = read<StaffUser>(USER_KEY);
  const token = read<string>(TOKEN_KEY);
  if (demoRequested()) {
    return {
      kind: 'signed-in',
      demo: true,
      user: user?.role === 'TEACHER' ? user : { name: 'Рустам', role: 'OWNER', telegramUserId: 1 },
    };
  }
  if (token && user) return { kind: 'signed-in', user, demo: false };
  return { kind: 'anonymous' };
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>(initialState);
  const apiUrl = useMemo(apiBaseUrl, []);
  const botUsername = import.meta.env.VITE_BOT_USERNAME ?? '';

  const signOut = useCallback(() => {
    write(TOKEN_KEY, null);
    write(USER_KEY, null);
    write(DEMO_KEY, null);
    setState({ kind: 'anonymous' });
  }, []);

  const demo = state.kind === 'signed-in' && state.demo;
  const role = state.kind === 'signed-in' ? state.user.role : 'OWNER';
  const api = useMemo<AdminApi>(() => {
    if (demo) return new MockAdminApi(role);
    return new HttpAdminApi(apiUrl, () => read<string>(TOKEN_KEY), signOut);
  }, [demo, role, apiUrl, signOut]);

  const loginWithToken = useCallback((token: string, name?: string) => {
    const claims = claimsOf(token);
    const staff = claims.roles.includes('OWNER')
      ? 'OWNER'
      : claims.roles.includes('TEACHER')
        ? 'TEACHER'
        : null;
    if (!staff) throw new Error('В токене нет роли OWNER или TEACHER.');
    const user: StaffUser = {
      name: name?.trim() || (staff === 'OWNER' ? 'Владелец' : 'Учитель'),
      role: staff,
      telegramUserId: claims.telegramUserId,
    };
    write(TOKEN_KEY, token);
    write(USER_KEY, user);
    write(DEMO_KEY, null);
    setState({ kind: 'signed-in', user, demo: false });
  }, []);

  const loginWithTelegram = useCallback(
    async (payload: TelegramLoginPayload) => {
      const http = new HttpAdminApi(apiUrl, () => null);
      const res = await http.auth.telegramLogin(payload);
      loginWithToken(res.token, [payload.first_name, payload.last_name].filter(Boolean).join(' '));
    },
    [apiUrl, loginWithToken],
  );

  const startDemo = useCallback((r: 'OWNER' | 'TEACHER') => {
    const user: StaffUser =
      r === 'OWNER'
        ? { name: 'Рустам', role: 'OWNER', telegramUserId: 1 }
        : { name: 'Дилшод Усманов', role: 'TEACHER', telegramUserId: 777 };
    write(DEMO_KEY, '1');
    write(USER_KEY, user);
    setState({ kind: 'signed-in', user, demo: true });
  }, []);

  const value = useMemo<SessionValue>(
    () => ({
      api,
      state,
      apiUrl,
      botUsername,
      loginWithTelegram,
      loginWithToken,
      startDemo,
      signOut,
    }),
    [api, state, apiUrl, botUsername, loginWithTelegram, loginWithToken, startDemo, signOut],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const v = useContext(SessionContext);
  if (!v) throw new Error('useSession outside SessionProvider');
  return v;
}

export function useAdminApi(): AdminApi {
  return useSession().api;
}

export function useStaff(): StaffUser {
  const { state } = useSession();
  if (state.kind !== 'signed-in') throw new Error('useStaff outside a signed-in session');
  return state.user;
}

export function useIsOwner(): boolean {
  return useStaff().role === 'OWNER';
}
