import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf } from 'telegraf';
import { AppConfigService } from '../../../config/config.service';
import { studentMessages, studentMessagesFor } from '../../../domain/students/messages';

/**
 * The bot configures itself at boot so nothing has to be typed into @BotFather
 * (except `/setdomain` for the dashboard's Login Widget, which has no API):
 * no slash commands (students write free text), the menu button opens the
 * Mini App at WEBAPP_URL, the profile texts describe the product.
 */
@Injectable()
export class BotCommandsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(BotCommandsService.name);

  constructor(
    @InjectBot() private readonly bot: Telegraf,
    private readonly config: AppConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.configure();
  }

  /** Idempotent; every call is best-effort (a missing network must not stop the boot). */
  async configure(): Promise<void> {
    await this.step('clear command menus', async () => {
      await this.bot.telegram.deleteMyCommands({ scope: { type: 'all_private_chats' } });
      await this.bot.telegram.deleteMyCommands({ scope: { type: 'all_chat_administrators' } });
      await this.bot.telegram.deleteMyCommands({ scope: { type: 'default' } });
    });
    const url = this.config.webAppUrl;
    await this.step(url ? `menu button → ${url}` : 'menu button → default (no WEBAPP_URL)', () =>
      this.bot.telegram.setChatMenuButton({
        menuButton: url
          ? { type: 'web_app', text: studentMessages.openAppButton, web_app: { url } }
          : { type: 'default' },
      }),
    );
    await this.step('profile texts', async () => {
      await this.bot.telegram.setMyDescription(studentMessages.botDescription);
      await this.bot.telegram.setMyShortDescription(studentMessages.botShortDescription);
      const en = studentMessagesFor('en');
      await this.bot.telegram.setMyDescription(en.botDescription, 'en');
      await this.bot.telegram.setMyShortDescription(en.botShortDescription, 'en');
    });
  }

  private async step(what: string, run: () => Promise<unknown>): Promise<void> {
    try {
      await run();
      this.logger.log(`Bot setup: ${what}`);
    } catch (err) {
      this.logger.warn(`Bot setup failed (${what}): ${(err as Error).message}`);
    }
  }
}
