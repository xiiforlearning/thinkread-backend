/**
 * Port to Telegram for membership checks. Implemented in infra/bot; the domain
 * only sees this interface so it can be tested with a fake.
 */
export const MEMBERSHIP_PORT = Symbol('MEMBERSHIP_PORT');

export type MemberStatus =
  | 'member'
  | 'not_member'
  /** The bot could not query the group (removed from it, chat not found, network). */
  | 'error';

export interface MembershipPort {
  getMemberStatus(chatId: number, telegramUserId: number): Promise<MemberStatus>;
}
