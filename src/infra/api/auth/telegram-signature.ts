import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { ErrorCode, ErrorLevel, ServiceCode } from '../../../common/codes';
import { AppError } from '../../../common/errors';

export interface TelegramWebAppUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface VerifiedInitData {
  user: TelegramWebAppUser;
  authDate: Date;
  /** `startapp` deep-link parameter, e.g. "cards" or "report". */
  startParam: string | null;
}

export interface TelegramLoginPayload {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

function invalid(
  error: typeof ErrorCode.INIT_DATA_INVALID | typeof ErrorCode.INIT_DATA_EXPIRED,
): AppError {
  return new AppError({ level: ErrorLevel.LOW_VALIDATION, service: ServiceCode.AUTH, error });
}

function checkString(pairs: Array<[string, string]>): string {
  return pairs
    .filter(([k]) => k !== 'hash')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
}

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

/**
 * Mini App `initData`: `secret = HMAC_SHA256("WebAppData", BOT_TOKEN)`,
 * `hash == HMAC_SHA256(secret, data_check_string)`, not older than `maxAgeSec`.
 */
export function verifyInitData(
  initData: string,
  botToken: string,
  maxAgeSec: number,
  now = new Date(),
): VerifiedInitData {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) throw invalid(ErrorCode.INIT_DATA_INVALID);
  const pairs: Array<[string, string]> = [];
  params.forEach((v, k) => pairs.push([k, v]));
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = createHmac('sha256', secret).update(checkString(pairs)).digest('hex');
  if (!safeEqualHex(expected, hash)) throw invalid(ErrorCode.INIT_DATA_INVALID);

  const authDateRaw = Number(params.get('auth_date'));
  if (!Number.isFinite(authDateRaw)) throw invalid(ErrorCode.INIT_DATA_INVALID);
  const authDate = new Date(authDateRaw * 1000);
  if (now.getTime() - authDate.getTime() > maxAgeSec * 1000)
    throw invalid(ErrorCode.INIT_DATA_EXPIRED);

  const userRaw = params.get('user');
  if (!userRaw) throw invalid(ErrorCode.INIT_DATA_INVALID);
  let user: TelegramWebAppUser;
  try {
    user = JSON.parse(userRaw) as TelegramWebAppUser;
  } catch {
    throw invalid(ErrorCode.INIT_DATA_INVALID);
  }
  if (!Number.isInteger(user.id)) throw invalid(ErrorCode.INIT_DATA_INVALID);
  return { user, authDate, startParam: params.get('start_param') };
}

/** Telegram Login Widget (dashboard): `secret = SHA256(BOT_TOKEN)`. */
export function verifyTelegramLogin(
  payload: TelegramLoginPayload,
  botToken: string,
  maxAgeSec: number,
  now = new Date(),
): TelegramLoginPayload {
  const pairs = Object.entries(payload)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => [k, String(v)] as [string, string]);
  const secret = createHash('sha256').update(botToken).digest();
  const expected = createHmac('sha256', secret).update(checkString(pairs)).digest('hex');
  if (!safeEqualHex(expected, String(payload.hash))) throw invalid(ErrorCode.INIT_DATA_INVALID);
  if (now.getTime() - Number(payload.auth_date) * 1000 > maxAgeSec * 1000)
    throw invalid(ErrorCode.INIT_DATA_EXPIRED);
  if (!Number.isInteger(Number(payload.id))) throw invalid(ErrorCode.INIT_DATA_INVALID);
  return payload;
}
