import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DailyReport } from './daily-report.entity';
import { ReportsService } from './reports.service';

@Module({
  imports: [TypeOrmModule.forFeature([DailyReport])],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
