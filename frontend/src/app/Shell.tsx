import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../api/types';
import { insideTelegram } from '../telegram/webapp';
import {
  Badge,
  Button,
  Callout,
  Icon,
  type TabKey,
  TabBar,
  TelegramHeader,
} from '../ui/components';
import { useBackButton } from './hooks';
import { useSession } from './session';

/**
 * Screen frame from the design: in-app title row (drawn only outside Telegram,
 * where the client has no chrome of its own), scrolling body, optional
 * sticky bottom bar (MainButton) and the tab bar on top-level screens.
 */
export function Screen({
  tab,
  back,
  head,
  bottom,
  children,
}: {
  tab?: TabKey;
  /** Route of the previous screen; enables the Telegram BackButton. */
  back?: string;
  /** Non-scrolling header block (title + segmented control). */
  head?: ReactNode;
  bottom?: ReactNode;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const { demo } = useSession();
  useBackButton(back ?? null);
  const native = insideTelegram();
  return (
    <div className="tr tr-mobile tr-app">
      {!native ? (
        <TelegramHeader back={!!back} onBack={() => (back ? navigate(back) : undefined)} />
      ) : null}
      {demo ? (
        <span className="tr-demo-badge">
          <Badge tone="cards">демо</Badge>
        </span>
      ) : null}
      {head ? <div className="tr-screen-head">{head}</div> : null}
      <div className="tr-screen">{children}</div>
      {bottom}
      {tab ? <TabBar active={tab} /> : null}
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
