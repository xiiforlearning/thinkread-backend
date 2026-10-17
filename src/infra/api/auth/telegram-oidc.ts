import { createPublicKey, JsonWebKey, KeyObject, verify as verifySignature } from 'crypto';
import { Logger, Provider } from '@nestjs/common';
import { ErrorCode, ErrorLevel, ServiceCode } from '../../../common/codes';
import { AppError } from '../../../common/errors';

/**
 * "Log in with Telegram" (OpenID Connect): the popup on the dashboard hands the page a signed
 * `id_token`; we check it against Telegram's published keys (JWKS) — no client secret, no bot
 * token involved. The bot is the OAuth client: `aud` is its id (the number before ":" in the
 * bot token, or BotFather's "Client ID"). `id` is the Telegram user id; `sub` is an opaque,
 * client-specific identifier and is not used.
 */
export const TELEGRAM_OIDC_ISSUER = 'https://oauth.telegram.org';
export const TELEGRAM_OIDC_JWKS_URL = 'https://oauth.telegram.org/.well-known/jwks.json';
export const TELEGRAM_OIDC_TOKEN_URL = 'https://oauth.telegram.org/token';

const CLOCK_SKEW_SEC = 60;
const JWKS_TTL_MS = 60 * 60 * 1000;
/** Do not hammer the JWKS endpoint on a flood of tokens with unknown `kid`s. */
const JWKS_REFETCH_COOLDOWN_MS = 30 * 1000;
const ALGORITHMS = {
  RS256: { kty: 'RSA', dsaEncoding: undefined },
  ES256: { kty: 'EC', dsaEncoding: 'ieee-p1363' as const },
};

export interface TelegramIdClaims {
  /** Telegram user id. */
  id: number;
  name?: string;
  given_name?: string;
  family_name?: string;
  preferred_username?: string;
  picture?: string;
}

export interface Jwk extends JsonWebKey {
  kid?: string;
  alg?: string;
  use?: string;
}
export type JwksFetcher = () => Promise<{ keys: Jwk[] }>;

/** The authorization-code exchange (web: the page redirects to oauth.telegram.org and comes back with `code`). */
export interface CodeExchange {
  code: string;
  codeVerifier: string;
  redirectUri: string;
  clientId: string;
  /** BotFather's client secret — sent as HTTP Basic when set; the native SDKs go without. */
  clientSecret?: string;
}
export interface TokenResponse {
  status: number;
  body: { id_token?: string; error?: string; error_description?: string };
}
export type TokenFetcher = (
  form: URLSearchParams,
  basicAuth: string | null,
) => Promise<TokenResponse>;

interface KeyEntry {
  kid: string | undefined;
  kty: string | undefined;
  key: KeyObject;
}

interface Header {
  alg?: string;
  kid?: string;
  typ?: string;
}

interface Payload {
  iss?: unknown;
  aud?: unknown;
  exp?: unknown;
  iat?: unknown;
  id?: unknown;
  name?: unknown;
  given_name?: unknown;
  family_name?: unknown;
  preferred_username?: unknown;
  picture?: unknown;
}

function invalid(
  error: typeof ErrorCode.INIT_DATA_INVALID | typeof ErrorCode.INIT_DATA_EXPIRED,
): AppError {
  return new AppError({ level: ErrorLevel.LOW_VALIDATION, service: ServiceCode.AUTH, error });
}

function decodeSegment<T>(segment: string): T | null {
  try {
    return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as T;
  } catch {
    return null;
  }
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

async function fetchTelegramToken(
  form: URLSearchParams,
  basicAuth: string | null,
): Promise<TokenResponse> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  if (basicAuth) headers.Authorization = `Basic ${basicAuth}`;
  const res = await fetch(TELEGRAM_OIDC_TOKEN_URL, {
    method: 'POST',
    headers,
    body: form.toString(),
    signal: AbortSignal.timeout(10_000),
    redirect: 'error',
  });
  let body: TokenResponse['body'] = {};
  try {
    body = (await res.json()) as TokenResponse['body'];
  } catch {
    body = {};
  }
  return { status: res.status, body };
}

async function fetchTelegramJwks(): Promise<{ keys: Jwk[] }> {
  const res = await fetch(TELEGRAM_OIDC_JWKS_URL, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
    redirect: 'error',
  });
  if (!res.ok) throw new Error(`JWKS fetch failed: HTTP ${res.status}`);
  return (await res.json()) as { keys: Jwk[] };
}

export class TelegramOidcVerifier {
  private readonly logger = new Logger(TelegramOidcVerifier.name);
  private cache: { keys: KeyEntry[]; fetchedAt: number } | null = null;
  private inflight: Promise<KeyEntry[]> | null = null;

  /** Not `@Injectable()`: the fetchers are plain functions (tests swap them), so Nest must not inject them. */
  constructor(
    private readonly fetchJwks: JwksFetcher = fetchTelegramJwks,
    private readonly fetchToken: TokenFetcher = fetchTelegramToken,
  ) {}

  /**
   * Authorization-code flow: swap the `code` the page came back with for an id_token (PKCE
   * verifier proves it is the same browser that started the login), then verify it like any
   * other id_token. A refused code is INIT_DATA_INVALID; Telegram being down is 601202.
   */
  async exchange(x: CodeExchange, now = new Date()): Promise<TelegramIdClaims> {
    const form = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: x.clientId,
      code: x.code,
      redirect_uri: x.redirectUri,
      code_verifier: x.codeVerifier,
    });
    const basic = x.clientSecret
      ? Buffer.from(`${x.clientId}:${x.clientSecret}`).toString('base64')
      : null;
    let res: TokenResponse;
    try {
      res = await this.fetchToken(form, basic);
    } catch (err) {
      this.logger.error(`Telegram token endpoint unavailable: ${(err as Error).message}`);
      throw new AppError({
        level: ErrorLevel.HIGH_INTEGRATION,
        service: ServiceCode.AUTH,
        error: ErrorCode.TELEGRAM_API_UNAVAILABLE,
      });
    }
    if (res.status !== 200 || !res.body.id_token) {
      this.logger.warn(
        `Telegram refused the authorization code: HTTP ${res.status} ${res.body.error ?? ''} ${res.body.error_description ?? ''}`.trim(),
      );
      throw invalid(ErrorCode.INIT_DATA_INVALID);
    }
    return this.verify(res.body.id_token, x.clientId, now);
  }

  /** The verified claims of `idToken`, or an AppError (INIT_DATA_INVALID / _EXPIRED). */
  async verify(idToken: string, clientId: string, now = new Date()): Promise<TelegramIdClaims> {
    const parts = idToken.split('.');
    if (parts.length !== 3) throw invalid(ErrorCode.INIT_DATA_INVALID);
    const header = decodeSegment<Header>(parts[0]);
    const payload = decodeSegment<Payload>(parts[1]);
    if (!header || !payload) throw invalid(ErrorCode.INIT_DATA_INVALID);

    const algorithm = header.alg ? ALGORITHMS[header.alg as keyof typeof ALGORITHMS] : undefined;
    if (!algorithm) {
      this.logger.warn(`id_token with unsupported alg ${header.alg ?? '(none)'}`);
      throw invalid(ErrorCode.INIT_DATA_INVALID);
    }

    const candidates = (await this.keysFor(header.kid, now)).filter((k) => k.kty === algorithm.kty);
    const signed = Buffer.from(`${parts[0]}.${parts[1]}`);
    const signature = Buffer.from(parts[2], 'base64url');
    const verified = candidates.some((k) =>
      verifySignature(
        'sha256',
        signed,
        algorithm.dsaEncoding ? { key: k.key, dsaEncoding: algorithm.dsaEncoding } : k.key,
        signature,
      ),
    );
    if (!verified) throw invalid(ErrorCode.INIT_DATA_INVALID);

    if (payload.iss !== TELEGRAM_OIDC_ISSUER) throw invalid(ErrorCode.INIT_DATA_INVALID);
    const audience = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!audience.some((a) => String(a) === clientId)) throw invalid(ErrorCode.INIT_DATA_INVALID);

    const nowSec = now.getTime() / 1000;
    if (typeof payload.exp !== 'number' || payload.exp + CLOCK_SKEW_SEC < nowSec)
      throw invalid(ErrorCode.INIT_DATA_EXPIRED);
    if (typeof payload.iat === 'number' && payload.iat - CLOCK_SKEW_SEC > nowSec)
      throw invalid(ErrorCode.INIT_DATA_INVALID);

    const id = typeof payload.id === 'string' ? Number(payload.id) : payload.id;
    if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0)
      throw invalid(ErrorCode.INIT_DATA_INVALID);

    return {
      id,
      name: optionalString(payload.name),
      given_name: optionalString(payload.given_name),
      family_name: optionalString(payload.family_name),
      preferred_username: optionalString(payload.preferred_username),
      picture: optionalString(payload.picture),
    };
  }

  /** Cached keys; refetched when stale or when `kid` is unknown (key rotation). */
  private async keysFor(kid: string | undefined, now: Date): Promise<KeyEntry[]> {
    const t = now.getTime();
    const fresh = this.cache && t - this.cache.fetchedAt < JWKS_TTL_MS;
    const known = (keys: KeyEntry[]): KeyEntry[] =>
      kid === undefined ? keys : keys.filter((k) => k.kid === kid);
    if (this.cache && fresh) {
      const hit = known(this.cache.keys);
      if (hit.length > 0) return hit;
      if (t - this.cache.fetchedAt < JWKS_REFETCH_COOLDOWN_MS) return [];
    }
    const keys = await this.load(t);
    return known(keys);
  }

  private load(t: number): Promise<KeyEntry[]> {
    if (!this.inflight) {
      this.inflight = this.fetchJwks()
        .then((jwks) => {
          const keys = jwks.keys.flatMap((jwk): KeyEntry[] => {
            try {
              return [
                { kid: jwk.kid, kty: jwk.kty, key: createPublicKey({ key: jwk, format: 'jwk' }) },
              ];
            } catch {
              return [];
            }
          });
          this.cache = { keys, fetchedAt: t };
          return keys;
        })
        .catch((err: Error) => {
          this.logger.error(`Telegram JWKS unavailable: ${err.message}`);
          // Stale keys are better than none; otherwise the sign-in fails as "unavailable".
          if (this.cache) return this.cache.keys;
          throw new AppError({
            level: ErrorLevel.HIGH_INTEGRATION,
            service: ServiceCode.AUTH,
            error: ErrorCode.TELEGRAM_API_UNAVAILABLE,
          });
        })
        .finally(() => {
          this.inflight = null;
        });
    }
    return this.inflight;
  }
}

/** How ApiModule provides the verifier (a factory: the class has no injectable constructor). */
export const TELEGRAM_OIDC_VERIFIER: Provider = {
  provide: TelegramOidcVerifier,
  useFactory: (): TelegramOidcVerifier => new TelegramOidcVerifier(),
};
