import { Injectable, Logger } from '@nestjs/common';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf, TelegramError } from 'telegraf';
import { NotifierPort } from '../../../domain/notify/notifier.port';
import { StudentsService } from '../../../domain/students/students.service';
import { globalConfig } from '../../../config/global.config';
import { splitByNewlines } from '../utils/split-message';

@Injectable()
export class TelegramNotifierAdapter implements NotifierPort {
  private readonly logger = new Logger(TelegramNotifierAdapter.name);

  constructor(
    @InjectBot() private readonly bot: Telegraf,
    private readonly students: StudentsService,
  ) {}

  async sendToUser(telegramUserId: number, text: string): Promise<boolean> {
    try {
      for (const chunk of splitByNewlines(text, globalConfig.telegram.maxMessageLength)) {
        await this.bot.telegram.sendMessage(telegramUserId, chunk);
      }
      return true;
    } catch (err) {
      if (err instanceof TelegramError && err.code === 403) {
        // "bot was blocked by the user" — a warning, not an error; remember it.
        this.logger.warn(`DM to ${telegramUserId} refused: ${err.description}`);
        await this.students.markDmBlocked(telegramUserId).catch(() => undefined);
        return false;
      }
      this.logger.warn(`DM to ${telegramUserId} failed: ${(err as Error).message}`);
      return false;
    }
  }
}
