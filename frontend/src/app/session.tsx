import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { type Api, HttpApi } from '../api/client';
import { MockApi } from '../api/mock';
import type { AccessStatus, ApiRole } from '../api/types';
import { apiBaseUrl } from '../lib/api-url';
import { initData, insideTelegram, tg } from '../telegram/webapp';

const TOKEN_KEY = 'thinkread.token';

/**
 * Demo mode: explicit `VITE_DEMO=1`, or the app is opened outside Telegram
 * (no initData — nothing to sign in with). `?demo=pending|not_member|archived`
 * picks the first-login state to show.
 */
export function isDemo(): boolean {
  return import.meta.env.VITE_DEMO === '1' || !insideTelegram();
}

function demoAccess(): AccessStatus {
  const v = new URLSearchParams(window.location.search).get('demo');
  if (v === 'pending') return 'PENDING_NAME';
  if (v === 'not_member') return 'NOT_MEMBER';
  if (v === 'archived') return 'ARCHIVED';
  if (v === 'staff') return 'STAFF';
  return 'ACTIVE';
}

/** Dashboard session keys (admin/session.tsx reads them; both pages share the origin). */
const ADMIN_TOKEN_KEY = 'thinkread.admin.token';
const ADMIN_USER_KEY = 'thinkread.admin.user';
const ADMIN_DEMO_KEY = 'thinkread.admin.demo';

/**
 * Hand a staff member over to the dashboard page with the same JWT: the token from
 * /auth/webapp already carries the OWNER / TEACHER role. In demo mode the dashboard demo is
 * switched on instead.
 */
export function openDashboard(roles: ApiRole[], demo: boolean): void {
  const role = roles.includes('OWNER') ? 'OWNER' : 'TEACHER';
  const tgUser = tg()?.initDataUnsafe.user;
  const name = tgUser?.first_name || (role === 'OWNER' ? 'Владелец' : 'Учитель');
  try {
    if (demo) {
      localStorage.setItem(ADMIN_DEMO_KEY, JSON.stringify('1'));
    } else {
      localStorage.removeItem(ADMIN_DEMO_KEY);
      const token = sessionStorage.getItem(TOKEN_KEY);
      if (token) localStorage.setItem(ADMIN_TOKEN_KEY, JSON.stringify(token));
    }
    localStorage.setItem(
      ADMIN_USER_KEY,
      JSON.stringify({ name, role, telegramUserId: tgUser?.id ?? null }),
    );
  } catch {
    /* private mode: the dashboard will ask to sign in */
  }
  window.location.assign('./admin.html');
}

export type SessionState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; status: AccessStatus; roles: ApiRole[] };

interface SessionValue {
  api: Api;
  demo: boolean;
  state: SessionState;
  /** Re-run sign-in (e.g. "Проверить снова" after joining the group). */
  refresh: () => void;
  /** After /me/register succeeded. */
  activate: () => void;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const demo = useMemo(isDemo, []);
  const [state, setState] = useState<SessionState>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);

  const api = useMemo<Api>(() => {
    if (demo) return new MockApi({ access: demoAccess() });
    return new HttpApi(
      apiBaseUrl(),
      () => sessionStorage.getItem(TOKEN_KEY),
      () => sessionStorage.removeItem(TOKEN_KEY),
    );
  }, [demo]);

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });
    api.auth
      .webApp(initData())
      .then((res) => {
        if (cancelled) return;
        if (res.token) sessionStorage.setItem(TOKEN_KEY, res.token);
        else sessionStorage.removeItem(TOKEN_KEY);
        setState({ kind: 'ready', status: res.status, roles: res.roles });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setState({ kind: 'error', message: e instanceof Error ? e.message : 'Не удалось войти' });
      });
    return () => {
      cancelled = true;
    };
  }, [api, attempt]);

  const refresh = useCallback(() => setAttempt((n) => n + 1), []);
  const activate = useCallback(
    () =>
      setState((s) => ({
        kind: 'ready',
        status: 'ACTIVE',
        roles: s.kind === 'ready' ? [...new Set<ApiRole>(['STUDENT', ...s.roles])] : ['STUDENT'],
      })),
    [],
  );

  const value = useMemo<SessionValue>(
    () => ({ api, demo, state, refresh, activate }),
    [api, demo, state, refresh, activate],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const v = useContext(SessionContext);
  if (!v) throw new Error('useSession outside SessionProvider');
  return v;
}

export function useApi(): Api {
  return useSession().api;
}
