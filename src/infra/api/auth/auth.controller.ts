import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsInt, IsOptional, IsString, IsUrl, MinLength, ValidateIf } from 'class-validator';
import { AppConfigService } from '../../../config/config.service';
import { AuthService } from './auth.service';

class WebAppAuthDto {
  @IsString()
  @MinLength(10)
  initData!: string;
}

/**
 * One of: the authorization `code` Telegram redirected the dashboard back with (plus the PKCE
 * `code_verifier` and the exact `redirect_uri`), the OpenID Connect `id_token` of the popup
 * library, or the legacy Login Widget payload (`id … auth_date hash`).
 */
class TelegramLoginDto {
  @IsOptional() @IsString() @MinLength(4) code?: string;
  @ValidateIf((o: TelegramLoginDto) => !!o.code) @IsString() @MinLength(43) code_verifier?: string;
  @ValidateIf((o: TelegramLoginDto) => !!o.code)
  @IsUrl({ require_tld: false })
  redirect_uri?: string;
  @IsOptional() @IsString() @MinLength(20) id_token?: string;
  @ValidateIf((o: TelegramLoginDto) => !o.id_token && !o.code) @IsInt() id?: number;
  @IsOptional() @IsString() first_name?: string;
  @IsOptional() @IsString() last_name?: string;
  @IsOptional() @IsString() username?: string;
  @IsOptional() @IsString() photo_url?: string;
  @ValidateIf((o: TelegramLoginDto) => !o.id_token && !o.code) @IsInt() auth_date?: number;
  @ValidateIf((o: TelegramLoginDto) => !o.id_token && !o.code) @IsString() hash?: string;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: AppConfigService,
  ) {}

  @Get('login-config')
  @ApiOperation({ summary: 'Public: the OAuth client id for the "Log in with Telegram" popup' })
  loginConfig(): { clientId: string } {
    return { clientId: this.config.telegramLoginClientId };
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
  @ApiOperation({ summary: 'Dashboard sign-in with "Log in with Telegram" (OWNER / TEACHER)' })
  telegramLogin(@Body() dto: TelegramLoginDto): ReturnType<AuthService['telegramLogin']> {
    if (dto.code)
      return this.auth.telegramCodeLogin(
        dto.code,
        dto.code_verifier as string,
        dto.redirect_uri as string,
      );
    if (dto.id_token) return this.auth.telegramOidcLogin(dto.id_token);
    return this.auth.telegramLogin({
      id: dto.id as number,
      first_name: dto.first_name,
      last_name: dto.last_name,
      username: dto.username,
      photo_url: dto.photo_url,
      auth_date: dto.auth_date as number,
      hash: dto.hash as string,
    });
  }
}
