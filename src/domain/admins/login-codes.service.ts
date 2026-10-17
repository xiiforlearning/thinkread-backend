import { createHash, randomInt } from 'crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ErrorCode, ErrorLevel, ServiceCode } from '../../common/codes';
import { AppError } from '../../common/errors';
import { AppConfigService } from '../../config/config.service';
import { NOTIFIER_PORT, NotifierPort } from '../notify/notifier.port';
import { AccessService } from './access.service';
import { AdminRole } from './admin.entity';
import { loginCodeMessages } from './messages';

/** A code is valid this long and for this many wrong guesses. */
export const LOGIN_CODE_TTL_MS = 5 * 60 * 1000;
export const LOGIN_CODE_MAX_ATTEMPTS = 5;
/** A new code for the same person no sooner than this (the request button is public). */
export const LOGIN_CODE_RESEND_MS = 30 * 1000;
/** Wrong guesses from everyone within the window that void every live code (brute force). */
const GLOBAL_FAILURES_LIMIT = 20;
const GLOBAL_FAILURES_WINDOW_MS = 10 * 60 * 1000;

interface LiveCode {
  telegramUserId: number;
  role: AdminRole;
  hash: string;
  issuedAt: number;
  expiresAt: number;
  attempts: number;
}

export interface LoginCodeIssue {
  code: string;
  expiresAt: Date;
}

/**
 * Dashboard sign-in without leaving Telegram: a 6-digit one-time code goes to the staff
 * member's chat with the bot (the owner asks for it with a button on the site, a teacher by
 * writing anything to the bot) and is typed on the site. Codes live in memory: one process,
 * five minutes, hashed — a restart only means asking again.
 */
@Injectable()
export class LoginCodesService {
  private readonly logger = new Logger(LoginCodesService.name);
  private readonly live = new Map<number, LiveCode>();
  private failures: number[] = [];

  constructor(
    private readonly access: AccessService,
    private readonly config: AppConfigService,
    @Inject(NOTIFIER_PORT) private readonly notifier: NotifierPort,
  ) {}

  /** The site's button: a code for the owner (ADMIN_TELEGRAM_ID), sent by the bot. */
  async sendToOwner(now = new Date()): Promise<{ expiresAt: Date }> {
    const ownerId = this.config.adminTelegramId;
    const issued = await this.issue(ownerId, now);
    const sent = await this.notifier.sendToUser(
      ownerId,
      loginCodeMessages.code(issued.code, this.dashboardUrl()),
    );
    if (!sent) {
      this.live.delete(ownerId);
      throw new AppError({
        level: ErrorLevel.LOW_BUSINESS,
        service: ServiceCode.AUTH,
        error: ErrorCode.BOT_BLOCKED_BY_USER,
        message: loginCodeMessages.ownerUnreachable,
      });
    }
    return { expiresAt: issued.expiresAt };
  }

  /**
   * A fresh code for a staff member (owner or teacher); the caller delivers it. Not staff →
   * null. Asking again within LOGIN_CODE_RESEND_MS is refused with TOO_MANY_REQUESTS.
   */
  async issue(telegramUserId: number, now = new Date()): Promise<LoginCodeIssue> {
    const role = await this.access.staffRole(telegramUserId);
    if (!role)
      throw new AppError({
        level: ErrorLevel.LOW_BUSINESS,
        service: ServiceCode.AUTH,
        error: ErrorCode.FORBIDDEN,
      });
    const t = now.getTime();
    const previous = this.live.get(telegramUserId);
    if (previous && t - previous.issuedAt < LOGIN_CODE_RESEND_MS)
      throw new AppError({
        level: ErrorLevel.LOW_BUSINESS,
        service: ServiceCode.AUTH,
        error: ErrorCode.TOO_MANY_REQUESTS,
        message: loginCodeMessages.tooSoon,
      });
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const expiresAt = t + LOGIN_CODE_TTL_MS;
    this.live.set(telegramUserId, {
      telegramUserId,
      role,
      hash: hashOf(code),
      issuedAt: t,
      expiresAt,
      attempts: 0,
    });
    this.logger.log(`login code issued for ${telegramUserId} (${role})`);
    return { code, expiresAt: new Date(expiresAt) };
  }

  /**
   * The code typed on the site → who it belongs to. Wrong or expired → INIT_DATA_INVALID.
   * A code is single-use; LOGIN_CODE_MAX_ATTEMPTS wrong guesses burn it.
   */
  redeem(code: string, now = new Date()): { telegramUserId: number; role: AdminRole } {
    const t = now.getTime();
    this.sweep(t);
    const hash = hashOf(code.replace(/\D/g, ''));
    const hit = [...this.live.values()].find((c) => c.hash === hash);
    if (hit) {
      this.live.delete(hit.telegramUserId);
      this.logger.log(`login code redeemed by ${hit.telegramUserId}`);
      return { telegramUserId: hit.telegramUserId, role: hit.role };
    }
    for (const c of this.live.values()) {
      c.attempts += 1;
      if (c.attempts >= LOGIN_CODE_MAX_ATTEMPTS) this.live.delete(c.telegramUserId);
    }
    this.failures.push(t);
    this.failures = this.failures.filter((f) => t - f < GLOBAL_FAILURES_WINDOW_MS);
    if (this.failures.length >= GLOBAL_FAILURES_LIMIT) {
      this.logger.warn('too many wrong login codes: all live codes voided');
      this.live.clear();
      this.failures = [];
    }
    throw new AppError({
      level: ErrorLevel.LOW_VALIDATION,
      service: ServiceCode.AUTH,
      error: ErrorCode.INIT_DATA_INVALID,
      message: loginCodeMessages.wrongCode,
    });
  }

  dashboardUrl(): string | null {
    const base = this.config.webAppUrl;
    return base ? `${base.replace(/\/?$/, '/')}admin.html` : null;
  }

  private sweep(t: number): void {
    for (const c of this.live.values()) if (c.expiresAt <= t) this.live.delete(c.telegramUserId);
  }
}

function hashOf(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}
