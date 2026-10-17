import { LOGIN_CODE_TTL_MS, LoginCodesService } from './login-codes.service';

const NOW = new Date('2026-10-17T10:00:00Z');
const at = (ms: number): Date => new Date(NOW.getTime() + ms);

function make(role: 'OWNER' | 'TEACHER' | null = 'OWNER'): {
  codes: LoginCodesService;
  notifier: { sendToUser: jest.Mock };
} {
  const access = { staffRole: jest.fn().mockResolvedValue(role) };
  const config = { adminTelegramId: 1, webAppUrl: 'https://app.example/' };
  const notifier = { sendToUser: jest.fn().mockResolvedValue(true) };
  return {
    codes: new LoginCodesService(access as never, config as never, notifier as never),
    notifier,
  };
}

describe('LoginCodesService', () => {
  it('sends the owner a 6-digit code with the dashboard link and redeems it once', async () => {
    const { codes, notifier } = make();
    await codes.sendToOwner(NOW);
    const text = notifier.sendToUser.mock.calls[0][1] as string;
    const code = /(\d{6})/.exec(text)?.[1] as string;
    expect(notifier.sendToUser).toHaveBeenCalledWith(1, expect.stringContaining('admin.html'));
    expect(codes.redeem(`${code.slice(0, 3)} ${code.slice(3)}`, at(1000))).toEqual({
      telegramUserId: 1,
      role: 'OWNER',
    });
    expect(() => codes.redeem(code, at(2000))).toThrow(expect.objectContaining({ code: '201953' }));
  });

  it('issues to a teacher who writes to the bot, refuses non-staff and too-soon repeats', async () => {
    const { codes } = make('TEACHER');
    const first = await codes.issue(7, NOW);
    expect(first.code).toMatch(/^\d{6}$/);
    expect(first.expiresAt.getTime()).toBe(NOW.getTime() + LOGIN_CODE_TTL_MS);
    await expect(codes.issue(7, at(10_000))).rejects.toMatchObject({ code: '301951' });
    await expect(codes.issue(7, at(31_000))).resolves.toBeTruthy();
    await expect(make(null).codes.issue(9, NOW)).rejects.toMatchObject({ code: '301004' });
  });

  it('expires after five minutes and burns after five wrong guesses', async () => {
    const { codes } = make();
    const { code } = await codes.issue(1, NOW);
    expect(() => codes.redeem(code, at(LOGIN_CODE_TTL_MS + 1))).toThrow();
    const { code: second } = await codes.issue(1, at(60_000));
    for (let i = 0; i < 5; i += 1) expect(() => codes.redeem('000000', at(61_000 + i))).toThrow();
    expect(() => codes.redeem(second, at(62_000))).toThrow();
  });

  it('reports a blocked bot instead of leaving a code the owner never saw', async () => {
    const { codes, notifier } = make();
    notifier.sendToUser.mockResolvedValue(false);
    await expect(codes.sendToOwner(NOW)).rejects.toMatchObject({ code: '301252' });
  });
});
