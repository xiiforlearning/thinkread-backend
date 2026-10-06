import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AdminsModule } from '../../domain/admins/admins.module';
import { MembershipModule } from '../../domain/membership/membership.module';
import { NotifyModule } from '../../domain/notify/notify.module';
import { StudentsModule } from '../../domain/students/students.module';
import { MembershipCron } from './membership.cron';
import { RemindersCron } from './reminders.cron';
import { WeeklySummaryCron } from './weekly-summary.cron';

@Module({
  imports: [ScheduleModule.forRoot(), MembershipModule, StudentsModule, AdminsModule, NotifyModule],
  providers: [MembershipCron, RemindersCron, WeeklySummaryCron],
  exports: [MembershipCron],
})
export class SchedulerModule {}
