import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AdminsModule } from '../../domain/admins/admins.module';
import { MembershipModule } from '../../domain/membership/membership.module';
import { StudentsModule } from '../../domain/students/students.module';
import { MembershipCron } from './membership.cron';

@Module({
  imports: [ScheduleModule.forRoot(), MembershipModule, StudentsModule, AdminsModule],
  providers: [MembershipCron],
  exports: [MembershipCron],
})
export class SchedulerModule {}
