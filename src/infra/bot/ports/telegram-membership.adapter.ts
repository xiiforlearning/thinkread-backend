import { Injectable, Logger } from '@nestjs/common';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf, TelegramError } from 'telegraf';
import { MemberStatus, MembershipPort } from '../../../domain/membership/membership.port';

const MEMBER_STATUSES = new Set(['creator', 'administrator', 'member']);

@Injectable()
export class TelegramMembershipAdapter implements MembershipPort {
  private readonly logger = new Logger(TelegramMembershipAdapter.name);

  constructor(@InjectBot() private readonly bot: Telegraf) {}

  async getMemberStatus(chatId: number, telegramUserId: number): Promise<MemberStatus> {
    try {
      const member = await this.bot.telegram.getChatMember(chatId, telegramUserId);
      if (MEMBER_STATUSES.has(member.status)) return 'member';
      // "restricted" users are still in the chat only when is_member is true.
      if (member.status === 'restricted') return member.is_member ? 'member' : 'not_member';
      return 'not_member';
    } catch (err) {
      if (err instanceof TelegramError && err.code === 400 && isUnknownUser(err.description)) {
        return 'not_member';
      }
      const description = err instanceof TelegramError ? err.description : (err as Error).message;
      this.logger.warn(`getChatMember(${chatId}, ${telegramUserId}) failed: ${description}`);
      return 'error';
    }
  }
}

/** Telegram answers 400 for a user it has never seen in the chat. */
function isUnknownUser(description: string): boolean {
  const d = description.toLowerCase();
  return d.includes('user not found') || d.includes('participant_id_invalid');
}
