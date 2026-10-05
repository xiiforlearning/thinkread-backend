import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppConfigModule } from '../../config/config.module';
import { AppConfigService } from '../../config/config.service';
import { AdminsModule } from '../../domain/admins/admins.module';
import { AiModule } from '../../domain/ai/ai.module';
import { GroupsModule } from '../../domain/groups/groups.module';
import { ReportsModule } from '../../domain/reports/reports.module';
import { RegistrationModule } from '../../domain/students/registration.module';
import { StudentsModule } from '../../domain/students/students.module';
import { WordsModule } from '../../domain/words/words.module';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { JwtAuthGuard, StudentGuard } from './auth/guards';
import { MeController } from './me/me.controller';
import { MeReportsController } from './me/reports.controller';
import { MeWordsController } from './me/words.controller';

/**
 * REST API for the Mini App (student) and the dashboard (staff). Controllers
 * are thin: validation, auth and serialization; every rule lives in the domain.
 */
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [AppConfigModule],
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({ secret: config.jwtSecret }),
    }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 60 }]),
    StudentsModule,
    RegistrationModule,
    GroupsModule,
    AdminsModule,
    ReportsModule,
    WordsModule,
    AiModule,
  ],
  controllers: [AuthController, MeController, MeWordsController, MeReportsController],
  providers: [
    AuthService,
    JwtAuthGuard,
    StudentGuard,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class ApiModule {}
