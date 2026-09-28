import { Injectable } from '@nestjs/common';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf } from 'telegraf';
import { ErrorCode, ErrorLevel, ServiceCode } from '../../../common/codes';
import { AppError } from '../../../common/errors';

@Injectable()
export class BotInfoService {
  private cachedUsername: string | null = null;

  constructor(@InjectBot() private readonly bot: Telegraf) {}

  async getUsername(): Promise<string> {
    if (this.cachedUsername) return this.cachedUsername;
    const me = await this.bot.telegram.getMe();
    if (!me.username) {
      throw new AppError({
        level: ErrorLevel.HIGH_FUNCTIONAL,
        service: ServiceCode.BOT,
        error: ErrorCode.CONFIGURATION,
        message: 'Bot has no username — set one via @BotFather',
      });
    }
    this.cachedUsername = me.username;
    return this.cachedUsername;
  }
}
