import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/config.module';
import { GroupsModule } from './domain/groups/groups.module';
import { StudentsModule } from './domain/students/students.module';
import { BotModule } from './infra/bot/bot.module';
import { DatabaseModule } from './infra/db/db.module';
import { TeacherModule } from './infra/teacher/teacher.module';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    GroupsModule,
    StudentsModule,
    TeacherModule,
    BotModule,
  ],
})
export class AppModule {}
