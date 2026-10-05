import { Injectable } from '@nestjs/common';
import { ConfigService as NestConfigService } from '@nestjs/config';

@Injectable()
export class AppConfigService {
  constructor(private readonly config: NestConfigService) {}

  private require(key: string): string {
    const value = this.config.get<string>(key);
    if (value === undefined || value === null || value === '') {
      throw new Error(`Missing required env var: ${key}`);
    }
    return value;
  }

  get botToken(): string {
    return this.require('BOT_TOKEN');
  }

  get adminTelegramId(): number {
    const raw = this.require('ADMIN_TELEGRAM_ID');
    const parsed = Number(raw);
    if (!Number.isInteger(parsed)) {
      throw new Error(`ADMIN_TELEGRAM_ID must be an integer, got: ${raw}`);
    }
    return parsed;
  }

  isSuperAdmin(telegramUserId: number | undefined): boolean {
    if (telegramUserId === undefined) return false;
    return telegramUserId === this.adminTelegramId;
  }

  get anthropicApiKey(): string {
    return this.require('ANTHROPIC_API_KEY');
  }

  /** Model for the student dialog. */
  get aiModelDialog(): string {
    return this.config.get<string>('AI_MODEL_DIALOG') ?? 'claude-haiku-4-5';
  }

  /** Model for the background authenticity check of reports; defaults to the dialog model. */
  get aiModelAuthenticity(): string {
    return this.config.get<string>('AI_MODEL_AUTHENTICITY') ?? this.aiModelDialog;
  }

  /** `BOT_LAUNCH=false` boots the app without Telegram polling (boot checks, CI, API-only runs). */
  get botLaunch(): boolean {
    return (this.config.get<string>('BOT_LAUNCH') ?? 'true').toLowerCase() !== 'false';
  }

  /** Secret for the API's JWTs. Required once the API is used. */
  get jwtSecret(): string {
    return this.require('JWT_SECRET');
  }

  /** Public HTTPS URL of the Mini App; without it bot messages carry no "open" button. */
  get webAppUrl(): string | undefined {
    const url = this.config.get<string>('WEBAPP_URL');
    return url && url.length > 0 ? url : undefined;
  }

  /** Allowed CORS origins for the API (comma-separated). Empty = same-origin only. */
  get corsOrigins(): string[] {
    return (this.config.get<string>('CORS_ORIGINS') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  get timezone(): string {
    return this.config.get<string>('TZ') ?? 'Asia/Tashkent';
  }

  get databaseUrl(): string | undefined {
    const url = this.config.get<string>('DATABASE_URL');
    return url && url.length > 0 ? url : undefined;
  }

  get databaseSsl(): boolean {
    const raw = (this.config.get<string>('DATABASE_SSL') ?? '').toLowerCase();
    return raw === 'true' || raw === '1';
  }

  get databaseHost(): string {
    return this.require('DATABASE_HOST');
  }

  get databasePort(): number {
    return Number(this.config.get<string>('DATABASE_PORT') ?? '5432');
  }

  get databaseUser(): string {
    return this.require('DATABASE_USER');
  }

  get databasePassword(): string {
    return this.require('DATABASE_PASSWORD');
  }

  get databaseName(): string {
    return this.require('DATABASE_NAME');
  }

  get nodeEnv(): string {
    return this.config.get<string>('NODE_ENV') ?? 'development';
  }

  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }
}
