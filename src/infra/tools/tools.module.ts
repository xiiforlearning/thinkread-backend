import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GroupsModule } from '../../domain/groups/groups.module';
import { Presentation } from '../../domain/presentations/presentation.entity';
import { DailyReport } from '../../domain/reports/daily-report.entity';
import { ReportsModule } from '../../domain/reports/reports.module';
import { StudentsModule } from '../../domain/students/students.module';
import { Word } from '../../domain/words/word.entity';
import { ReportBuilderModule } from '../report-builder/report-builder.module';
import { SchedulerModule } from '../scheduler/scheduler.module';
import { ToolsController } from './tools.controller';
import { ToolsGuard } from './tools.guard';
import { ToolsService } from './tools.service';

/**
 * Demo/ops HTTP surface. Import last in AppModule. Exposes /tools/* (Swagger at
 * /docs). Keep behind TOOLS_KEY (or a private network) in any shared environment.
 * The Telegraf bot is injected via nestjs-telegraf's global provider.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([DailyReport, Word, Presentation]),
    StudentsModule,
    ReportsModule,
    GroupsModule,
    ReportBuilderModule,
    SchedulerModule,
  ],
  controllers: [ToolsController],
  providers: [ToolsService, ToolsGuard],
})
export class ToolsModule {}
