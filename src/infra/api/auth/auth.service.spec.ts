import { createHmac } from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { Student } from '../../../domain/students/student.entity';
import { AuthService } from './auth.service';

const TOKEN = '123456:ABC-DEF';

function initDataFor(id: number): string {
  const fields: Record<string, string> = {
    auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify({ id, username: 'u' + id }),
  };
  const check = Object.entries(fields)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(TOKEN).digest();
  const p = new URLSearchParams(fields);
  p.set('hash', createHmac('sha256', secret).update(check).digest('hex'));
  return p.toString();
}

function make(
  status: string,
  student: Student | null,
  staff: string | null = null,
): { auth: AuthService; registration: { resolve: jest.Mock } } {
  const registration = { resolve: jest.fn().mockResolvedValue({ status, student }) };
  const access = { staffRole: jest.fn().mockResolvedValue(staff) };
  const jwt = new JwtService({ secret: 'test-secret' });
  const auth = new AuthService(
    jwt,
    { botToken: TOKEN } as never,
    registration as never,
    access as never,
  );
  return { auth, registration };
}

describe('AuthService.webApp', () => {
  it('gives an ACTIVE student a STUDENT token the guard can verify', async () => {
    const student = Object.assign(new Student(), { id: 's1' });
    const { auth, registration } = make('ACTIVE', student);
    const res = await auth.webApp(initDataFor(100));
    expect(res.status).toBe('ACTIVE');
    expect(res.roles).toEqual(['STUDENT']);
    expect(registration.resolve).toHaveBeenCalledWith(
      { telegramUserId: 100, username: 'u100' },
      { staff: false },
    );
    const principal = await auth.verify(res.token as string);
    expect(principal).toEqual({
      telegramUserId: 100,
      studentId: 's1',
      status: 'ACTIVE',
      roles: ['STUDENT'],
    });
  });

  it('gives a PENDING_NAME student a token without the STUDENT role', async () => {
    const { auth } = make('PENDING_NAME', Object.assign(new Student(), { id: 's2' }));
    const res = await auth.webApp(initDataFor(101));
    expect(res.status).toBe('PENDING_NAME');
    expect(res.roles).toEqual([]);
    expect(res.token).toEqual(expect.any(String));
  });

  it('gives no token to a non-member or an archived student', async () => {
    expect((await make('NOT_MEMBER', null).auth.webApp(initDataFor(102))).token).toBeNull();
    expect(
      (
        await make('ARCHIVED', Object.assign(new Student(), { id: 's3' })).auth.webApp(
          initDataFor(103),
        )
      ).token,
    ).toBeNull();
  });

  it('adds the staff role for the owner even without a student record', async () => {
    const { auth } = make('NOT_MEMBER', null, 'OWNER');
    const res = await auth.webApp(initDataFor(104));
    expect(res.roles).toEqual(['OWNER']);
    expect(res.token).toEqual(expect.any(String));
  });

  it('tells registration the caller is staff, so a teacher gets STAFF instead of a student form', async () => {
    const { auth, registration } = make('STAFF', null, 'TEACHER');
    const res = await auth.webApp(initDataFor(105));
    expect(registration.resolve).toHaveBeenCalledWith(
      { telegramUserId: 105, username: 'u105' },
      { staff: true },
    );
    expect(res.status).toBe('STAFF');
    expect(res.roles).toEqual(['TEACHER']);
    expect(res.token).toEqual(expect.any(String));
    const principal = await auth.verify(res.token as string);
    expect(principal.roles).toEqual(['TEACHER']);
    expect(principal.studentId).toBeNull();
  });

  it('rejects a bad token on verify', async () => {
    const { auth } = make('ACTIVE', null);
    await expect(auth.verify('nope')).rejects.toMatchObject({ code: '201952' });
  });
});
