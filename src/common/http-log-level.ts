/**
 * How much of every HTTP exchange goes to the log (`LOG_HTTP`):
 * `full` (default) — method, path, status, duration, who called and the request and response
 * bodies; `summary` — the same line without bodies (plus the error code of a failure);
 * `off` — nothing. `/health` is never logged.
 */
export type HttpLogLevel = 'off' | 'summary' | 'full';

export function parseHttpLogLevel(raw: string | undefined): HttpLogLevel {
  const value = (raw ?? '').trim().toLowerCase();
  if (value === 'off' || value === 'false' || value === '0') return 'off';
  if (value === 'summary') return 'summary';
  return 'full';
}
