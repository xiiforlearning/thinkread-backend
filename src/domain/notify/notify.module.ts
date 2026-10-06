import { Module } from '@nestjs/common';
import { AdminsModule } from '../admins/admins.module';
import { CardsModule } from '../cards/cards.module';
import { FlagsModule } from '../flags/flags.module';
import { GroupsModule } from '../groups/groups.module';
import { NormsModule } from '../norms/norms.module';
import { ReportsModule } from '../reports/reports.module';
import { StudentsModule } from '../students/students.module';
import { ReminderPlannerService } from './reminder-planner.service';
import { WeeklySummaryService } from './weekly-summary.service';

/** Outgoing messages: scheduled reminders and the weekly summary (NOTIFIER_PORT is global). */
@Module({
  imports: [
    StudentsModule,
    GroupsModule,
    NormsModule,
    ReportsModule,
    FlagsModule,
    CardsModule,
    AdminsModule,
  ],
  providers: [ReminderPlannerService, WeeklySummaryService],
  exports: [ReminderPlannerService, WeeklySummaryService],
})
export class NotifyModule {}
