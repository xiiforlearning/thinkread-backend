import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AppConfigModule } from './config/config.module';
import { GroupsModule } from './domain/groups/groups.module';
import { PresentationsModule } from './domain/presentations/presentations.module';
import { ReportsModule } from './domain/reports/reports.module';
import { StudentsModule } from './domain/students/students.module';
import { WordsModule } from './domain/words/words.module';
import { BotModule } from './infra/bot/bot.module';
import { DatabaseModule } from './infra/db/db.module';
import { ReportBuilderModule } from './infra/report-builder/report-builder.module';
import { ReviewModule } from './infra/review/review.module';
import { SchedulerModule } from './infra/scheduler/scheduler.module';
import { TeacherModule } from './infra/teacher/teacher.module';
import { ToolsModule } from './infra/tools/tools.module';

@Module({
  imports: [
    AppConfigModule,
    ScheduleModule.forRoot(),
    DatabaseModule,
    GroupsModule,
    StudentsModule,
    WordsModule,
    ReportsModule,
    PresentationsModule,
    ReviewModule,
    ReportBuilderModule,
    TeacherModule,
    BotModule,
    SchedulerModule,
    ToolsModule,
  ],
})
export class AppModule {}
