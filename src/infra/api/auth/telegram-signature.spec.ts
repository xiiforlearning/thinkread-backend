import { createHash, createHmac } from 'crypto';
import { verifyInitData, verifyTelegramLogin } from './telegram-signature';

const TOKEN = '123456:ABC-DEF';

function signInitData(fields: Record<string, string>, token = TOKEN): string {
  const check = Object.entries(fields)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = createHmac('sha256', secret).update(check).digest('hex');
  const p = new URLSearchParams(fields);
  p.set('hash', hash);
  return p.toString();
}

const NOW = new Date('2026-10-01T10:00:00Z');
const user = JSON.stringify({
  id: 1278797125,
  first_name: 'Otabek',
  username: 'otabekazamov_work',
});

describe('verifyInitData', () => {
  it('accepts a correctly signed, fresh initData and returns the user and start_param', () => {
    const initData = signInitData({
      auth_date: String(Math.floor(NOW.getTime() / 1000) - 60),
      user,
      start_param: 'cards',
    });
    const v = verifyInitData(initData, TOKEN, 86_400, NOW);
    expect(v.user.id).toBe(1278797125);
    expect(v.user.username).toBe('otabekazamov_work');
    expect(v.startParam).toBe('cards');
  });

  it('rejects a signature made with another bot token', () => {
    const initData = signInitData(
      { auth_date: String(Math.floor(NOW.getTime() / 1000)), user },
      'other:token',
    );
    expect(() => verifyInitData(initData, TOKEN, 86_400, NOW)).toThrow(
      expect.objectContaining({ code: '201953' }),
    );
  });

  it('rejects tampered fields', () => {
    const initData = signInitData({ auth_date: String(Math.floor(NOW.getTime() / 1000)), user });
    const tampered = initData.replace('otabekazamov_work', 'someone_else');
    expect(() => verifyInitData(tampered, TOKEN, 86_400, NOW)).toThrow(
      expect.objectContaining({ code: '201953' }),
    );
  });

  it('rejects initData older than the max age', () => {
    const initData = signInitData({
      auth_date: String(Math.floor(NOW.getTime() / 1000) - 2 * 86_400),
      user,
    });
    expect(() => verifyInitData(initData, TOKEN, 86_400, NOW)).toThrow(
      expect.objectContaining({ code: '201954' }),
    );
  });

  it('rejects initData without a hash or user', () => {
    expect(() => verifyInitData('auth_date=1&user=%7B%7D', TOKEN, 86_400, NOW)).toThrow(
      expect.objectContaining({ code: '201953' }),
    );
    const noUser = signInitData({ auth_date: String(Math.floor(NOW.getTime() / 1000)) });
    expect(() => verifyInitData(noUser, TOKEN, 86_400, NOW)).toThrow(
      expect.objectContaining({ code: '201953' }),
    );
  });
});

describe('verifyTelegramLogin', () => {
  it('accepts the Login Widget payload signed with sha256(token)', () => {
    const payload = {
      id: 42,
      first_name: 'Rustam',
      auth_date: Math.floor(NOW.getTime() / 1000) - 10,
    };
    const check = Object.entries(payload)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');
    const hash = createHmac('sha256', createHash('sha256').update(TOKEN).digest())
      .update(check)
      .digest('hex');
    expect(verifyTelegramLogin({ ...payload, hash }, TOKEN, 86_400, NOW).id).toBe(42);
    expect(() => verifyTelegramLogin({ ...payload, id: 43, hash }, TOKEN, 86_400, NOW)).toThrow(
      expect.objectContaining({ code: '201953' }),
    );
  });
});
