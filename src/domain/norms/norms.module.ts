import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReminderLog } from './reminder-log.entity';
import { RemindersService } from './reminders.service';

@Module({
  imports: [TypeOrmModule.forFeature([ReminderLog])],
  providers: [RemindersService],
  exports: [RemindersService],
})
export class NormsModule {}
