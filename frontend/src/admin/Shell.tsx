import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { ApiError } from '../api/types';
import { Avatar, Badge, Button, Callout, Icon, NavItem } from '../ui/components';
import { useAdminApi, useSession, useStaff } from './session';

/** Dashboard frame from the design: dark sidebar with counters, scrolling main; optional list pane. */
export function Shell({ pane, children }: { pane?: ReactNode; children: ReactNode }) {
  const { pathname } = useLocation();
  const { state, signOut } = useSession();
  const user = useStaff();
  const api = useAdminApi();
  const counts = useQuery({
    queryKey: ['nav-counts'],
    queryFn: async () => {
      const [students, flags] = await Promise.all([
        api.students.list({}),
        api.flags.list({ status: 'NEW' }),
      ]);
      return { students: students.length, flags: flags.length };
    },
    staleTime: 60_000,
  });
  const demo = state.kind === 'signed-in' && state.demo;
  const is = (p: string) => (p === '/' ? pathname === '/' : pathname.startsWith(p));
  const webapp = (import.meta.env.BASE_URL ?? './').replace(/\/?$/, '/') + (demo ? '?demo=1' : '');
  return (
    <div className="tr tr-desktop ad-app">
      <aside className="ad-side">
        <div className="ad-brand">
          <b>ThinkRead</b>
          <span>Дашборд учителя</span>
        </div>
        <NavItem icon="grid" to="/" active={is('/')}>
          Обзор
        </NavItem>
        <NavItem icon="users" to="/students" active={is('/students')} count={counts.data?.students}>
          Студенты
        </NavItem>
        <NavItem
          icon="flag"
          to="/flags"
          active={is('/flags')}
          count={counts.data?.flags}
          alert={(counts.data?.flags ?? 0) > 0}
        >
          Флаги
        </NavItem>
        <NavItem icon="chat" to="/groups" active={is('/groups')}>
          Группы
        </NavItem>
        {user.role === 'OWNER' ? (
          <NavItem icon="sliders" to="/settings" active={is('/settings')}>
            Настройки
          </NavItem>
        ) : null}
        <div style={{ flexGrow: 1 }} />
        <NavItem icon="phone" href={webapp}>
          Открыть Mini App
        </NavItem>
        <NavItem icon="logout" onClick={signOut}>
          Выйти
        </NavItem>
        <div className="ad-user">
          <Avatar name={user.name} size="sm" tone="white" />
          <span>
            <b>{user.name}</b>
            <span>
              {user.role} · Asia/Tashkent{demo ? ' · демо' : ''}
            </span>
          </span>
        </div>
      </aside>
      {pane}
      <main className="ad-main">{children}</main>
    </div>
  );
}

export function PageHead({
  title,
  subtitle,
  aside,
  size = 'lg',
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  aside?: ReactNode;
  size?: 'lg' | 'md';
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        {size === 'lg' ? <h1 className="ad-h1">{title}</h1> : <h2 className="ad-h2">{title}</h2>}
        {subtitle ? <span className="ad-sub">{subtitle}</span> : null}
      </div>
      {aside}
    </div>
  );
}

export function Loading({ text = 'Загружаю…' }: { text?: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        color: 'var(--ink-2)',
        padding: '24px 0',
        justifyContent: 'center',
        fontSize: 14,
      }}
    >
      <Icon name="spinner" /> {text}
    </div>
  );
}

export function errorText(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Что-то пошло не так';
}

export function ErrorBox({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <Callout tone="bad" title="Не получилось">
      {errorText(error)}
      {retry ? (
        <div style={{ marginTop: 8 }}>
          <Button variant="secondary" size="sm" icon="refresh" onClick={retry}>
            Попробовать снова
          </Button>
        </div>
      ) : null}
    </Callout>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div style={{ padding: '24px 20px', fontSize: 13, color: 'var(--ink-2)', textAlign: 'center' }}>
      {children}
    </div>
  );
}

/** "Появится позже" marker for stage-8 features the real backend does not serve yet. */
export function SoonBadge() {
  return <Badge tone="neutral">скоро</Badge>;
}
