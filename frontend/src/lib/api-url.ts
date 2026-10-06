/**
 * Base URL of the REST API for both pages (Mini App and dashboard). Build-time
 * `VITE_API_URL` is the default; `?api=https://…` in the page URL overrides it
 * and is remembered in localStorage, so one static build (GitHub Pages) can
 * point at a local backend behind a tunnel: `…/?api=https://xxx.trycloudflare.com`.
 * `?api=` (empty) forgets the override.
 */
const KEY = 'thinkread.apiUrl';

export function apiBaseUrl(): string {
  const q = new URLSearchParams(window.location.search).get('api');
  if (q !== null) {
    try {
      if (q) localStorage.setItem(KEY, q);
      else localStorage.removeItem(KEY);
    } catch {
      /* private mode */
    }
  }
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(KEY);
  } catch {
    stored = null;
  }
  return (q || stored || import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
}
