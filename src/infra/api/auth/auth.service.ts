import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ErrorCode, ErrorLevel, ServiceCode } from '../../../common/codes';
import { AppError } from '../../../common/errors';
import { AppConfigService } from '../../../config/config.service';
import { AccessService } from '../../../domain/admins/access.service';
import { AccessStatus, RegistrationService } from '../../../domain/students/registration.service';
import { ApiRole, Principal } from './principal';
import { TelegramLoginPayload, verifyInitData, verifyTelegramLogin } from './telegram-signature';

const INIT_DATA_MAX_AGE_SEC = 24 * 3600;
const TOKEN_TTL = '12h';

export interface WebAppAuthResult {
  status: AccessStatus;
  roles: ApiRole[];
  /** Absent for NOT_MEMBER / ARCHIVED. */
  token: string | null;
  startParam: string | null;
}

interface JwtClaims {
  sub: string;
  sid: string | null;
  st: AccessStatus | null;
  roles: ApiRole[];
}

/**
 * Who is calling the API. The Mini App signs in with Telegram's initData;
 * registration happens right here (a group member becomes PENDING_NAME and
 * gets a token that only opens /me/register). The dashboard signs in with
 * the Telegram Login Widget and needs a staff role.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
    private readonly registration: RegistrationService,
    private readonly access: AccessService,
  ) {}

  async webApp(initData: string): Promise<WebAppAuthResult> {
    const { user, startParam } = verifyInitData(
      initData,
      this.config.botToken,
      INIT_DATA_MAX_AGE_SEC,
    );
    const { status, student } = await this.registration.resolve({
      telegramUserId: user.id,
      username: user.username ?? null,
    });
    const staff = await this.access.staffRole(user.id);
    const roles: ApiRole[] = [];
    if (status === 'ACTIVE') roles.push('STUDENT');
    if (staff) roles.push(staff);

    const tokenAllowed = status === 'ACTIVE' || status === 'PENDING_NAME' || staff !== null;
    const token = tokenAllowed
      ? await this.sign({ telegramUserId: user.id, studentId: student?.id ?? null, status, roles })
      : null;
    return { status, roles, token, startParam };
  }

  /** Dashboard: only OWNER / TEACHER get in. */
  async telegramLogin(payload: TelegramLoginPayload): Promise<{ token: string; roles: ApiRole[] }> {
    const verified = verifyTelegramLogin(payload, this.config.botToken, INIT_DATA_MAX_AGE_SEC);
    const staff = await this.access.staffRole(Number(verified.id));
    if (!staff) {
      this.logger.log(`dashboard login refused for ${verified.id}: not staff`);
      throw new AppError({
        level: ErrorLevel.LOW_BUSINESS,
        service: ServiceCode.AUTH,
        error: ErrorCode.FORBIDDEN,
      });
    }
    const token = await this.sign({
      telegramUserId: Number(verified.id),
      studentId: null,
      status: null,
      roles: [staff],
    });
    return { token, roles: [staff] };
  }

  async verify(token: string): Promise<Principal> {
    let claims: JwtClaims;
    try {
      claims = await this.jwt.verifyAsync<JwtClaims>(token);
    } catch {
      throw new AppError({
        level: ErrorLevel.LOW_VALIDATION,
        service: ServiceCode.AUTH,
        error: ErrorCode.INVALID_TOKEN,
      });
    }
    return {
      telegramUserId: Number(claims.sub),
      studentId: claims.sid,
      status: claims.st,
      roles: claims.roles ?? [],
    };
  }

  private sign(p: Principal): Promise<string> {
    const claims: JwtClaims = {
      sub: String(p.telegramUserId),
      sid: p.studentId,
      st: p.status,
      roles: p.roles,
    };
    return this.jwt.signAsync(claims, { expiresIn: TOKEN_TTL });
  }
}
