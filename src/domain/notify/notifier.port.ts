/**
 * Port for sending Telegram messages from domain services (owner summaries,
 * reminders). Implemented in infra/bot with dm_blocked handling.
 */
export const NOTIFIER_PORT = Symbol('NOTIFIER_PORT');

export interface NotifierPort {
  /** Best-effort DM. Resolves false (never throws) when the user blocked the bot or the send failed. */
  sendToUser(telegramUserId: number, text: string): Promise<boolean>;
}
