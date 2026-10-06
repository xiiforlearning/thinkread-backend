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
import type { AccessStatus } from '../api/types';
import { apiBaseUrl } from '../lib/api-url';
import { initData, insideTelegram } from '../telegram/webapp';

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
  return 'ACTIVE';
}

export type SessionState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; status: AccessStatus };

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
        setState({ kind: 'ready', status: res.status });
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
  const activate = useCallback(() => setState({ kind: 'ready', status: 'ACTIVE' }), []);

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
