import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/config.module';
import { AdminsModule } from './domain/admins/admins.module';
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
    MembershipModule,
    RegistrationModule,
    TeacherModule,
    BotModule,
    SchedulerModule,
  ],
})
export class AppModule {}
