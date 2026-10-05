import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/config.module';
import { AdminsModule } from './domain/admins/admins.module';
import { AiModule } from './domain/ai/ai.module';
import { FlagsModule } from './domain/flags/flags.module';
import { ReportsModule } from './domain/reports/reports.module';
import { NormsModule } from './domain/norms/norms.module';
import { AnthropicModule } from './infra/ai/anthropic.module';
import { GroupsModule } from './domain/groups/groups.module';
import { MembershipModule } from './domain/membership/membership.module';
import { SettingsModule } from './domain/settings/settings.module';
import { RegistrationModule } from './domain/students/registration.module';
import { StudentsModule } from './domain/students/students.module';
import { WordsModule } from './domain/words/words.module';
import { ApiModule } from './infra/api/api.module';
import { BotModule } from './infra/bot/bot.module';
import { DatabaseModule } from './infra/db/db.module';
import { SchedulerModule } from './infra/scheduler/scheduler.module';
import { TeacherModule } from './infra/teacher/teacher.module';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    GroupsModule,
    StudentsModule,
    AdminsModule,
    NormsModule,
    ReportsModule,
    FlagsModule,
    WordsModule,
    AnthropicModule,
    AiModule,
    MembershipModule,
    SettingsModule,
    RegistrationModule,
    TeacherModule,
    BotModule,
    ApiModule,
    SchedulerModule,
  ],
})
export class AppModule {}
