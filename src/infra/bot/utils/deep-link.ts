export function buildGroupDeepLink(botUsername: string, chatId: number): string {
  return `https://t.me/${botUsername}?start=group_${chatId}`;
}
