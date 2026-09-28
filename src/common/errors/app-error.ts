import { ErrorCode, ErrorLevel, ServiceCode } from '../codes';

export interface AppErrorParams {
  level: ErrorLevel;
  service: ServiceCode;
  error: ErrorCode;
  message?: string;
  meta?: Record<string, unknown>;
  cause?: unknown;
}

export class AppError extends Error {
  readonly level: ErrorLevel;
  readonly service: ServiceCode;
  readonly error: ErrorCode;
  readonly meta?: Record<string, unknown>;

  constructor(params: AppErrorParams) {
    super(params.message ?? `AppError [${AppError.formatCode(params)}]`);
    this.name = 'AppError';
    this.level = params.level;
    this.service = params.service;
    this.error = params.error;
    this.meta = params.meta;
    if (params.cause !== undefined) {
      (this as { cause?: unknown }).cause = params.cause;
    }
  }

  get code(): string {
    return AppError.formatCode({ level: this.level, service: this.service, error: this.error });
  }

  static formatCode(params: { level: ErrorLevel; service: ServiceCode; error: ErrorCode }): string {
    return `${params.level}${params.service}${params.error}`;
  }
}
