import { Global, Module } from '@nestjs/common';
import { MEMBERSHIP_PORT } from '../../../domain/membership/membership.port';
import { NOTIFIER_PORT } from '../../../domain/notify/notifier.port';
import { StudentsModule } from '../../../domain/students/students.module';
import { TelegramMembershipAdapter } from './telegram-membership.adapter';
import { TelegramNotifierAdapter } from './telegram-notifier.adapter';

/**
 * Global so domain modules can inject the ports by token without importing
 * anything from infra. Requires TelegrafModule to be registered (BotModule).
 */
@Global()
@Module({
  imports: [StudentsModule],
  providers: [
    { provide: MEMBERSHIP_PORT, useClass: TelegramMembershipAdapter },
    { provide: NOTIFIER_PORT, useClass: TelegramNotifierAdapter },
  ],
  exports: [MEMBERSHIP_PORT, NOTIFIER_PORT],
})
export class TelegramPortsModule {}
