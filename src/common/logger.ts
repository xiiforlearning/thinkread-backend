import { Logger } from '@nestjs/common';

export function createLogger(context: string): Logger {
  return new Logger(context);
}
