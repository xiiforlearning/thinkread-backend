import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsInt, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { LoginCodesService } from '../../../domain/admins/login-codes.service';
import { AuthService } from './auth.service';

class WebAppAuthDto {
  @IsString()
  @MinLength(10)
  initData!: string;
}

class CodeLoginDto {
  /** Six digits; spaces allowed. */
  @IsString()
  @Matches(/^\s*\d{3}\s?\d{3}\s*$/)
  code!: string;
}

/** The legacy Login Widget payload (`id … auth_date hash`), kept for bots not switched to OpenID Connect. */
class TelegramLoginDto {
  @IsInt() id!: number;
  @IsOptional() @IsString() first_name?: string;
  @IsOptional() @IsString() last_name?: string;
  @IsOptional() @IsString() username?: string;
  @IsOptional() @IsString() photo_url?: string;
  @IsInt() auth_date!: number;
  @IsString() hash!: string;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly loginCodes: LoginCodesService,
  ) {}

  @Post('code/request')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiOperation({ summary: 'Dashboard: the bot sends the owner a one-time 6-digit sign-in code' })
  async requestCode(): Promise<{ expiresAt: string }> {
    const { expiresAt } = await this.loginCodes.sendToOwner();
    return { expiresAt: expiresAt.toISOString() };
  }

  @Post('code/verify')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Dashboard sign-in with the code from the bot (OWNER / TEACHER)' })
  codeLogin(@Body() dto: CodeLoginDto): ReturnType<AuthService['codeLogin']> {
    return this.auth.codeLogin(dto.code);
  }

  @Post('webapp')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Mini App sign-in with Telegram initData; registers a group member as PENDING_NAME',
  })
  webApp(@Body() dto: WebAppAuthDto): ReturnType<AuthService['webApp']> {
    return this.auth.webApp(dto.initData);
  }

  @Post('telegram-login')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Dashboard sign-in with the legacy Telegram Login Widget (OWNER / TEACHER)',
  })
  telegramLogin(@Body() dto: TelegramLoginDto): ReturnType<AuthService['telegramLogin']> {
    return this.auth.telegramLogin(dto);
  }
}
