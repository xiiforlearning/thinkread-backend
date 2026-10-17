import { generateKeyPairSync, KeyObject, sign } from 'crypto';
import { Jwk, TELEGRAM_OIDC_ISSUER, TelegramOidcVerifier } from './telegram-oidc';

const NOW = new Date('2026-10-17T10:00:00Z');
const CLIENT = '123456';

const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' });

function jwk(key: KeyObject, kid: string): Jwk {
  return { ...(key.export({ format: 'jwk' }) as Jwk), kid };
}

function b64(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

function token(
  payload: Record<string, unknown>,
  opts: { alg?: 'RS256' | 'ES256'; kid?: string; key?: KeyObject } = {},
): string {
  const alg = opts.alg ?? 'RS256';
  const head = b64({ alg, kid: opts.kid ?? (alg === 'RS256' ? 'rsa-1' : 'ec-1'), typ: 'JWT' });
  const body = b64({
    iss: TELEGRAM_OIDC_ISSUER,
    aud: CLIENT,
    iat: NOW.getTime() / 1000 - 10,
    exp: NOW.getTime() / 1000 + 600,
    id: 777,
    ...payload,
  });
  const key = opts.key ?? (alg === 'RS256' ? rsa.privateKey : ec.privateKey);
  const sig = sign(
    'sha256',
    Buffer.from(`${head}.${body}`),
    alg === 'ES256' ? { key, dsaEncoding: 'ieee-p1363' } : key,
  );
  return `${head}.${body}.${sig.toString('base64url')}`;
}

function make(keys: Jwk[] = [jwk(rsa.publicKey, 'rsa-1'), jwk(ec.publicKey, 'ec-1')]): {
  verifier: TelegramOidcVerifier;
  fetchJwks: jest.Mock;
} {
  const fetchJwks = jest.fn().mockResolvedValue({ keys });
  return { verifier: new TelegramOidcVerifier(fetchJwks), fetchJwks };
}

describe('TelegramOidcVerifier', () => {
  it('accepts an RS256 token signed by a published key and returns the Telegram user', async () => {
    const { verifier, fetchJwks } = make();
    const claims = await verifier.verify(
      token({ name: 'Рустам', preferred_username: 'rustam', sub: 'opaque' }),
      CLIENT,
      NOW,
    );
    expect(claims).toEqual({ id: 777, name: 'Рустам', preferred_username: 'rustam' });
    await verifier.verify(token({}), CLIENT, NOW);
    expect(fetchJwks).toHaveBeenCalledTimes(1);
  });

  it('accepts ES256 and a numeric-string id', async () => {
    const { verifier } = make();
    const claims = await verifier.verify(token({ id: '42' }, { alg: 'ES256' }), CLIENT, NOW);
    expect(claims.id).toBe(42);
  });

  it('rejects a bad signature, issuer, audience, or user id', async () => {
    const { verifier } = make();
    const other = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
    await expect(verifier.verify(token({}, { key: other }), CLIENT, NOW)).rejects.toMatchObject({
      code: '201953',
    });
    await expect(
      verifier.verify(token({ iss: 'https://evil' }), CLIENT, NOW),
    ).rejects.toMatchObject({ code: '201953' });
    await expect(verifier.verify(token({}), '999', NOW)).rejects.toMatchObject({ code: '201953' });
    await expect(verifier.verify(token({ id: 0 }), CLIENT, NOW)).rejects.toMatchObject({
      code: '201953',
    });
    await expect(verifier.verify('not-a-jwt', CLIENT, NOW)).rejects.toMatchObject({
      code: '201953',
    });
  });

  it('accepts an audience array and rejects an expired token', async () => {
    const { verifier } = make();
    await expect(verifier.verify(token({ aud: ['x', CLIENT] }), CLIENT, NOW)).resolves.toBeTruthy();
    const past = NOW.getTime() / 1000 - 3600;
    await expect(verifier.verify(token({ exp: past }), CLIENT, NOW)).rejects.toMatchObject({
      code: '201954',
    });
  });

  it('refetches the keys once for an unknown kid (rotation) and then serves the new key', async () => {
    const { verifier, fetchJwks } = make([jwk(rsa.publicKey, 'old')]);
    await expect(verifier.verify(token({}, { kid: 'old' }), CLIENT, NOW)).resolves.toBeTruthy();
    fetchJwks.mockResolvedValue({ keys: [jwk(rsa.publicKey, 'new')] });
    const later = new Date(NOW.getTime() + 60_000);
    await expect(verifier.verify(token({}, { kid: 'new' }), CLIENT, later)).resolves.toBeTruthy();
    expect(fetchJwks).toHaveBeenCalledTimes(2);
    // An unknown kid right after a refetch does not hit the endpoint again.
    await expect(verifier.verify(token({}, { kid: 'zzz' }), CLIENT, later)).rejects.toMatchObject({
      code: '201953',
    });
    expect(fetchJwks).toHaveBeenCalledTimes(2);
  });

  it('fails as Telegram unavailable when the keys cannot be fetched', async () => {
    const fetchJwks = jest.fn().mockRejectedValue(new Error('boom'));
    const verifier = new TelegramOidcVerifier(fetchJwks);
    await expect(verifier.verify(token({}), CLIENT, NOW)).rejects.toMatchObject({ code: '601202' });
  });
});
