import { Module } from '@nestjs/common';
import { GroupsModule } from '../../domain/groups/groups.module';
import { ReportsModule } from '../../domain/reports/reports.module';
import { StudentsModule } from '../../domain/students/students.module';
import { WordsModule } from '../../domain/words/words.module';
import { StudentDetailBuilderService } from './student-detail-builder.service';
import { WeeklyReportBuilderService } from './weekly-report-builder.service';

@Module({
  imports: [GroupsModule, StudentsModule, ReportsModule, WordsModule],
  providers: [WeeklyReportBuilderService, StudentDetailBuilderService],
  exports: [WeeklyReportBuilderService, StudentDetailBuilderService],
})
export class ReportBuilderModule {}
