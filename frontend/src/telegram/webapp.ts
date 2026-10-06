/**
 * Thin typed wrapper over `window.Telegram.WebApp` (loaded from
 * telegram-web-app.js in index.html). Outside Telegram every call is a no-op
 * and `initData` is empty, which is how the app decides to run on demo data.
 */
interface TgButton {
  show(): void;
  hide(): void;
  onClick(cb: () => void): void;
  offClick(cb: () => void): void;
}

interface TgWebApp {
  initData: string;
  initDataUnsafe: {
    start_param?: string;
    user?: { id: number; first_name?: string; username?: string };
  };
  colorScheme: 'light' | 'dark';
  themeParams: Record<string, string | undefined>;
  platform: string;
  version: string;
  ready(): void;
  expand(): void;
  close(): void;
  setHeaderColor(color: string): void;
  setBackgroundColor(color: string): void;
  enableClosingConfirmation?(): void;
  disableVerticalSwipes?(): void;
  onEvent(event: string, cb: () => void): void;
  offEvent(event: string, cb: () => void): void;
  openLink(url: string): void;
  openTelegramLink(url: string): void;
  BackButton: TgButton;
  HapticFeedback?: {
    impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void;
    notificationOccurred(type: 'error' | 'success' | 'warning'): void;
  };
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TgWebApp };
  }
}

export function tg(): TgWebApp | null {
  return window.Telegram?.WebApp ?? null;
}

export function insideTelegram(): boolean {
  const app = tg();
  return !!app && app.initData.length > 0;
}

export function initData(): string {
  return tg()?.initData ?? '';
}

export function colorScheme(): 'light' | 'dark' {
  const app = tg();
  if (app?.colorScheme) return app.colorScheme;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Apply the design-system theme and tell Telegram our background colours. */
export function applyTheme(): void {
  const scheme = colorScheme();
  document.documentElement.setAttribute('data-theme', scheme);
  const app = tg();
  if (!app) return;
  const bg = scheme === 'dark' ? '#141418' : '#f2f2f7';
  try {
    app.setHeaderColor(bg);
    app.setBackgroundColor(bg);
  } catch {
    /* older clients */
  }
}

export function setupWebApp(): void {
  const app = tg();
  applyTheme();
  if (!app) return;
  app.ready();
  app.expand();
  app.disableVerticalSwipes?.();
  app.onEvent('themeChanged', applyTheme);
}

export function haptic(kind: 'light' | 'success' | 'error'): void {
  const h = tg()?.HapticFeedback;
  if (!h) return;
  try {
    if (kind === 'light') h.impactOccurred('light');
    else h.notificationOccurred(kind);
  } catch {
    /* not supported */
  }
}

export function backButton(): TgButton | null {
  return tg()?.BackButton ?? null;
}
