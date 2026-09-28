import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/config.module';
import { AdminsModule } from './domain/admins/admins.module';
import { AiModule } from './domain/ai/ai.module';
import { NormsModule } from './domain/norms/norms.module';
import { AnthropicModule } from './infra/ai/anthropic.module';
import { GroupsModule } from './domain/groups/groups.module';
import { MembershipModule } from './domain/membership/membership.module';
import { RegistrationModule } from './domain/students/registration.module';
import { StudentsModule } from './domain/students/students.module';
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
    AnthropicModule,
    AiModule,
    MembershipModule,
    RegistrationModule,
    TeacherModule,
    BotModule,
    SchedulerModule,
  ],
})
export class AppModule {}
