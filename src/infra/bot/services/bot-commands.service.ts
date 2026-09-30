import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf } from 'telegraf';

/**
 * ThinkRead has no slash commands: students write in free text and the AI
 * understands the intent. Clear any command menu left over from the old bot.
 */
@Injectable()
export class BotCommandsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(BotCommandsService.name);

  constructor(@InjectBot() private readonly bot: Telegraf) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.bot.telegram.deleteMyCommands({ scope: { type: 'all_private_chats' } });
      await this.bot.telegram.deleteMyCommands({ scope: { type: 'all_chat_administrators' } });
      await this.bot.telegram.deleteMyCommands({ scope: { type: 'default' } });
      this.logger.log('Bot command menus cleared');
    } catch (err) {
      this.logger.warn(`Failed to clear bot commands: ${(err as Error).message}`);
    }
  }
}
