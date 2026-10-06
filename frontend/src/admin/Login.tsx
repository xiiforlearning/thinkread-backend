import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Button, Callout, Card, TextField } from '../ui/components';
import type { TelegramLoginPayload } from './api';
import { errorText } from './Shell';
import { useSession } from './session';

declare global {
  interface Window {
    onThinkReadTelegramAuth?: (user: TelegramLoginPayload) => void;
  }
}

/**
 * Sign-in: the Telegram Login Widget (OWNER / TEACHER only, verified by the backend),
 * a pasted developer token (`pnpm dev:token owner`) and the demo on in-memory data.
 */
export function LoginScreen() {
  const { botUsername, apiUrl, loginWithTelegram, loginWithToken, startDemo } = useSession();
  const widget = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState('');
  const [name, setName] = useState('');

  useEffect(() => {
    const host = widget.current;
    if (!host || !botUsername) return;
    window.onThinkReadTelegramAuth = (user) => {
      setBusy(true);
      setError(null);
      loginWithTelegram(user)
        .catch((e: unknown) => setError(errorText(e)))
        .finally(() => setBusy(false));
    };
    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.async = true;
    script.setAttribute('data-telegram-login', botUsername);
    script.setAttribute('data-size', 'large');
    script.setAttribute('data-radius', '12');
    script.setAttribute('data-onauth', 'onThinkReadTelegramAuth(user)');
    script.setAttribute('data-request-access', 'write');
    host.replaceChildren(script);
    return () => {
      host.replaceChildren();
      delete window.onThinkReadTelegramAuth;
    };
  }, [botUsername, loginWithTelegram]);

  const submitToken = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      loginWithToken(token.trim(), name);
    } catch (err) {
      setError(errorText(err));
    }
  };

  return (
    <div className="tr tr-desktop ad-login">
      <Card desktop title="ThinkRead · Дашборд" meta="для владельца и учителей">
        <span style={{ fontSize: 13, lineHeight: '18px', color: 'var(--ink-2)' }}>
          Вход через Telegram: пускаем только владельца школы и учителей (админов групп с подписью
          teacher). Студентам сюда не нужно — у них Mini App.
        </span>
        {botUsername ? (
          <div ref={widget} style={{ display: 'flex', justifyContent: 'center', minHeight: 44 }} />
        ) : (
          <Callout tone="info">
            Кнопка Telegram появится, когда в <code>frontend/.env</code> задан{' '}
            <code>VITE_BOT_USERNAME</code> и у бота настроен домен (@BotFather → /setdomain).
          </Callout>
        )}
        {busy ? <span className="ad-sub">Проверяю подпись Telegram…</span> : null}
        {error ? <Callout tone="bad">{error}</Callout> : null}

        <details>
          <summary style={{ fontSize: 13, cursor: 'pointer', color: 'var(--ink-2)' }}>
            Войти по токену разработчика
          </summary>
          <form
            onSubmit={submitToken}
            style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 10 }}
          >
            <TextField
              label="JWT"
              placeholder="pnpm dev:token owner"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
            <TextField
              label="Как вас показывать"
              placeholder="Рустам"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <span className="ad-sub">API: {apiUrl || 'тот же адрес, что и страница'}</span>
            <Button variant="dark" size="md" type="submit" disabled={!token.trim()}>
              Войти
            </Button>
          </form>
        </details>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button variant="tonal" size="md" icon="star" onClick={() => startDemo('OWNER')}>
            Демо: владелец
          </Button>
          <Button variant="ghost" size="md" onClick={() => startDemo('TEACHER')}>
            Демо: учитель
          </Button>
        </div>
        <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>
          Демо работает на данных из макета, без сервера.
        </span>
      </Card>
    </div>
  );
}
