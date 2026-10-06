import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsInt, IsOptional, IsString, MinLength } from 'class-validator';
import { AuthService } from './auth.service';

class WebAppAuthDto {
  @IsString()
  @MinLength(10)
  initData!: string;
}

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
  constructor(private readonly auth: AuthService) {}

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
  @ApiOperation({ summary: 'Dashboard sign-in with the Telegram Login Widget (OWNER / TEACHER)' })
  telegramLogin(@Body() dto: TelegramLoginDto): ReturnType<AuthService['telegramLogin']> {
    return this.auth.telegramLogin(dto);
  }
}
