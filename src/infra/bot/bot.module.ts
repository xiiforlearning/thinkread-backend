import { Module } from '@nestjs/common';
import { TelegrafModule } from 'nestjs-telegraf';
import { AppConfigModule } from '../../config/config.module';
import { AppConfigService } from '../../config/config.service';
import { GroupsModule } from '../../domain/groups/groups.module';
import { PresentationsModule } from '../../domain/presentations/presentations.module';
import { ReportsModule } from '../../domain/reports/reports.module';
import { StudentsModule } from '../../domain/students/students.module';
import { WordsModule } from '../../domain/words/words.module';
import { ReportBuilderModule } from '../report-builder/report-builder.module';
import { ReviewModule } from '../review/review.module';
import { SchedulerModule } from '../scheduler/scheduler.module';
import { TeacherModule } from '../teacher/teacher.module';
import { BotUpdate } from './bot.update';
import { AdminHandler } from './handlers/admin.handler';
import { DebugHandler } from './handlers/debug.handler';
import { EveningHandler } from './handlers/evening.handler';
import { ExercisesHandler } from './handlers/exercises.handler';
import { FlashcardHandler } from './handlers/flashcard.handler';
import { RegistrationHandler } from './handlers/registration.handler';
import { ReportHandler } from './handlers/report.handler';
import { StudentHandler } from './handlers/student.handler';
import { BotCommandsService } from './services/bot-commands.service';
import { BotInfoService } from './services/bot-info.service';

@Module({
  imports: [
    TelegrafModule.forRootAsync({
      imports: [AppConfigModule],
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        token: config.botToken,
      }),
    }),
    GroupsModule,
    StudentsModule,
    WordsModule,
    ReportsModule,
    PresentationsModule,
    ReviewModule,
    ReportBuilderModule,
    SchedulerModule,
    TeacherModule,
  ],
  providers: [
    BotInfoService,
    BotCommandsService,
    BotUpdate,
    RegistrationHandler,
    EveningHandler,
    ExercisesHandler,
    FlashcardHandler,
    StudentHandler,
    AdminHandler,
    ReportHandler,
    DebugHandler,
  ],
})
export class BotModule {}
