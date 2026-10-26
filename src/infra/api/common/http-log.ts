import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import type { RequestWithPrincipal } from '../auth/principal';

export { HttpLogLevel, parseHttpLogLevel } from '../../../common/http-log-level';
import type { HttpLogLevel } from '../../../common/http-log-level';

/** Credentials and one-time codes: never in the log, whatever the level. */
const SECRET_KEYS = new Set(['initdata', 'hash', 'token', 'code', 'password', 'authorization']);
/** Students' reports and retellings are personal data (CLAUDE.md): only their length is logged. */
const TEXT_KEYS = new Set(['text', 'summary', 'unclearparts']);
const MAX_BODY_CHARS = 2000;
const MAX_DEPTH = 8;

export function redact(value: unknown, depth = 0, parentKey = ''): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (depth > MAX_DEPTH) return '[…]';
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1, parentKey));
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    const k = key.toLowerCase();
    // `error.code` is the API error code, not a one-time code: it is what the log is for.
    if (parentKey === 'error' && k === 'code') out[key] = v;
    else if (SECRET_KEYS.has(k)) out[key] = v === null || v === undefined ? v : '[secret]';
    else if (TEXT_KEYS.has(k) && typeof v === 'string') out[key] = `[text ${v.length} chars]`;
    else if (TEXT_KEYS.has(k) && Array.isArray(v)) out[key] = `[text ×${v.length}]`;
    else out[key] = redact(v, depth + 1, k);
  }
  return out;
}

export function formatBody(value: unknown): string {
  if (value === undefined) return '-';
  if (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === 0
  )
    return '-';
  let json: string;
  try {
    json = JSON.stringify(redact(value)) ?? '-';
  } catch {
    return '[unserializable]';
  }
  return json.length > MAX_BODY_CHARS
    ? `${json.slice(0, MAX_BODY_CHARS)}…(${json.length} chars)`
    : json;
}

function errorCodeOf(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const error = (body as { error?: { code?: unknown } }).error;
  return error && typeof error.code === 'string' ? error.code : undefined;
}

function whoOf(req: Request): string {
  const principal = (req as RequestWithPrincipal).principal;
  if (principal)
    return principal.studentId
      ? `student:${principal.studentId}`
      : `tg:${principal.telegramUserId}:${principal.roles.join('+') || 'none'}`;
  return req.headers.authorization ? 'bearer' : 'anon';
}

/**
 * One log line per request, written when the response has been sent:
 * `POST /me/words 201 34ms who=student:… req={…} res={…}`. Levels: `log` for 2xx/3xx,
 * `warn` for 4xx, `error` for 5xx. The response body is caught on `res.json`, which both
 * Nest's reply and `ApiExceptionFilter` use.
 */
export function httpLogMiddleware(
  level: HttpLogLevel,
  logger: Pick<Logger, 'log' | 'warn' | 'error'> = new Logger('HTTP'),
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (level === 'off' || req.path === '/health') return next();
    const started = process.hrtime.bigint();
    let responseBody: unknown;
    const json = res.json.bind(res);
    res.json = (body: unknown) => {
      responseBody = body;
      return json(body);
    };
    res.on('finish', () => {
      const ms = Number((process.hrtime.bigint() - started) / 1_000_000n);
      const status = res.statusCode;
      let line = `${req.method} ${req.originalUrl ?? req.url} ${status} ${ms}ms who=${whoOf(req)}`;
      if (level === 'full') line += ` req=${formatBody(req.body)} res=${formatBody(responseBody)}`;
      else if (status >= 400) {
        const code = errorCodeOf(responseBody);
        if (code) line += ` error=${code}`;
      }
      if (status >= 500) logger.error(line);
      else if (status >= 400) logger.warn(line);
      else logger.log(line);
    });
    next();
  };
}
