/**
 * Mint a JWT for local API calls (same claims as AuthService.sign):
 *
 *   pnpm dev:token owner                 # OWNER from ADMIN_TELEGRAM_ID
 *   pnpm dev:token teacher 777           # TEACHER with that Telegram id
 *   pnpm dev:token student <studentId>   # ACTIVE student by uuid (telegram id looked up as 0)
 *
 * Prints the token; use it as `Authorization: Bearer <token>`.
 */
import { config as loadEnv } from 'dotenv';
import { sign } from 'jsonwebtoken';

loadEnv();

const [, , kind = 'owner', arg] = process.argv;
const secret = process.env.JWT_SECRET;
if (!secret) {
  console.error('JWT_SECRET is not set (see .env.example)');
  process.exit(1);
}

let claims: { sub: string; sid: string | null; st: string | null; roles: string[] };
switch (kind) {
  case 'owner':
    claims = {
      sub: String(process.env.ADMIN_TELEGRAM_ID ?? '1'),
      sid: null,
      st: null,
      roles: ['OWNER'],
    };
    break;
  case 'teacher':
    if (!arg) throw new Error('usage: dev:token teacher <telegramUserId>');
    claims = { sub: arg, sid: null, st: null, roles: ['TEACHER'] };
    break;
  case 'student':
    if (!arg) throw new Error('usage: dev:token student <studentId>');
    claims = { sub: process.env.DEV_STUDENT_TELEGRAM_ID ?? '0', sid: arg, st: 'ACTIVE', roles: ['STUDENT'] };
    break;
  default:
    throw new Error(`unknown kind ${kind}: owner | teacher <id> | student <uuid>`);
}

process.stdout.write(sign(claims, secret, { expiresIn: '12h' }) + '\n');
