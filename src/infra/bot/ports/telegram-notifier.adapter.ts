import { Injectable, Logger } from '@nestjs/common';
import { InjectBot } from 'nestjs-telegraf';
import { Markup, Telegraf, TelegramError } from 'telegraf';
import { AppConfigService } from '../../../config/config.service';
import { globalConfig } from '../../../config/global.config';
import { NotifierPort, NotifyOptions } from '../../../domain/notify/notifier.port';
import { studentMessages } from '../../../domain/students/messages';
import { StudentsService } from '../../../domain/students/students.service';
import { splitByNewlines } from '../utils/split-message';

@Injectable()
export class TelegramNotifierAdapter implements NotifierPort {
  private readonly logger = new Logger(TelegramNotifierAdapter.name);

  constructor(
    @InjectBot() private readonly bot: Telegraf,
    private readonly students: StudentsService,
    private readonly config: AppConfigService,
  ) {}

  async sendToUser(
    telegramUserId: number,
    text: string,
    options: NotifyOptions = {},
  ): Promise<boolean> {
    try {
      const chunks = splitByNewlines(text, globalConfig.telegram.maxMessageLength);
      const url = options.openApp ? this.config.webAppUrl : undefined;
      for (const [i, chunk] of chunks.entries()) {
        const last = i === chunks.length - 1;
        await this.bot.telegram.sendMessage(
          telegramUserId,
          chunk,
          last && url
            ? Markup.inlineKeyboard([Markup.button.webApp(studentMessages.openAppButton, url)])
            : undefined,
        );
      }
      return true;
    } catch (err) {
      if (err instanceof TelegramError && err.code === 403) {
        // "bot was blocked by the user" — a warning, not an error; remember it.
        this.logger.warn(`DM to ${telegramUserId} refused: ${err.description}`);
        await this.students.markDmBlocked(telegramUserId).catch(() => undefined);
        return false;
      }
      this.logger.warn(`DM to ${telegramUserId} failed: ${redactToken((err as Error).message)}`);
      return false;
    }
  }
}

/** Telegraf puts the request URL (with the bot token) into error messages — never log it. */
function redactToken(message: string): string {
  return message.replace(/bot\d+:[\w-]+/g, 'bot***');
}
