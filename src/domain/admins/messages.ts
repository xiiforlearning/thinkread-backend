/** Texts the bot sends to staff about the dashboard sign-in code. */
export const loginCodeMessages = {
  code: (code: string, dashboardUrl: string | null): string =>
    [
      `Код для входа в дашборд: ${code}`,
      'Действует 5 минут, введите его на странице входа.',
      dashboardUrl ? `Дашборд: ${dashboardUrl}` : null,
    ]
      .filter(Boolean)
      .join('\n'),
  /** A staff member wrote to the bot too soon after the previous code. */
  tooSoon: 'Код уже отправлен, подождите полминуты перед новым.',
  /** The site: the typed code did not match any live code. */
  wrongCode: 'Код неверный или устарел. Попросите новый.',
  /** The site: the bot could not write to the owner (no /start yet or the bot is blocked). */
  ownerUnreachable:
    'Бот не смог написать владельцу в Telegram: откройте чат с ботом, нажмите «Старт» и попробуйте снова.',
};
