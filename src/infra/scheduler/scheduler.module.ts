import { Module } from '@nestjs/common';
import { GroupsModule } from '../../domain/groups/groups.module';
import { PresentationsModule } from '../../domain/presentations/presentations.module';
import { ReportsModule } from '../../domain/reports/reports.module';
import { StudentsModule } from '../../domain/students/students.module';
import { WordsModule } from '../../domain/words/words.module';
import { ReportBuilderModule } from '../report-builder/report-builder.module';
import { SchedulerService } from './scheduler.service';

@Module({
  imports: [
    GroupsModule,
    StudentsModule,
    WordsModule,
    ReportsModule,
    PresentationsModule,
    ReportBuilderModule,
  ],
  providers: [SchedulerService],
  exports: [SchedulerService],
})
export class SchedulerModule {}
