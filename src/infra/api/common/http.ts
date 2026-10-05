import {
  ArgumentsHost,
  CallHandler,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { Response } from 'express';
import { Observable, map } from 'rxjs';
import { ErrorCode } from '../../../common/codes';
import { AppError } from '../../../common/errors';

const STATUS_BY_ERROR: Partial<Record<string, HttpStatus>> = {
  [ErrorCode.VALIDATION]: HttpStatus.BAD_REQUEST,
  [ErrorCode.BAD_REQUEST]: HttpStatus.BAD_REQUEST,
  [ErrorCode.NAME_INVALID]: HttpStatus.BAD_REQUEST,
  [ErrorCode.NOT_FOUND]: HttpStatus.NOT_FOUND,
  [ErrorCode.UNAUTHORIZED]: HttpStatus.UNAUTHORIZED,
  [ErrorCode.INVALID_TOKEN]: HttpStatus.UNAUTHORIZED,
  [ErrorCode.INIT_DATA_INVALID]: HttpStatus.UNAUTHORIZED,
  [ErrorCode.INIT_DATA_EXPIRED]: HttpStatus.UNAUTHORIZED,
  [ErrorCode.FORBIDDEN]: HttpStatus.FORBIDDEN,
  [ErrorCode.NOT_A_GROUP_MEMBER]: HttpStatus.FORBIDDEN,
  [ErrorCode.STUDENT_ARCHIVED]: HttpStatus.FORBIDDEN,
  [ErrorCode.DAILY_LIMIT_REACHED]: HttpStatus.CONFLICT,
  [ErrorCode.INVALID_STATE]: HttpStatus.CONFLICT,
  [ErrorCode.ALREADY_EXISTS]: HttpStatus.CONFLICT,
  [ErrorCode.IMPORT_EXPIRED]: HttpStatus.GONE,
  [ErrorCode.TOO_MANY_REQUESTS]: HttpStatus.TOO_MANY_REQUESTS,
  [ErrorCode.AI_UNAVAILABLE]: HttpStatus.SERVICE_UNAVAILABLE,
  [ErrorCode.AI_RATE_LIMITED]: HttpStatus.SERVICE_UNAVAILABLE,
};

/** `{ error: { code, message, details? } }` for every failure; codes are `{level}{service}{error}`. */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('API');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    if (exception instanceof AppError) {
      const status =
        STATUS_BY_ERROR[exception.error] ??
        (exception.level <= 3 ? HttpStatus.BAD_REQUEST : HttpStatus.INTERNAL_SERVER_ERROR);
      if (status >= 500) this.logger.error(`${exception.code}: ${exception.message}`);
      res.status(status).json({
        error: { code: exception.code, message: exception.message, details: exception.meta },
      });
      return;
    }
    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      const details =
        typeof body === 'object' ? (body as Record<string, unknown>) : { message: body };
      res.status(exception.getStatus()).json({
        error: { code: `HTTP${exception.getStatus()}`, message: exception.message, details },
      });
      return;
    }
    this.logger.error(`unhandled: ${(exception as Error)?.stack ?? exception}`);
    res
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json({ error: { code: 'HTTP500', message: 'Internal error' } });
  }
}

/** Every success is `{ data }` (lists add `meta.nextCursor` themselves). */
@Injectable()
export class DataEnvelopeInterceptor implements NestInterceptor {
  intercept(_ctx: unknown, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((value: unknown) => {
        if (value && typeof value === 'object' && 'data' in value && 'meta' in value) return value;
        return { data: value ?? null };
      }),
    );
  }
}
