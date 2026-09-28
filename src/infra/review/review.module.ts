import { Module } from '@nestjs/common';
import { ReportsModule } from '../../domain/reports/reports.module';
import { StudentsModule } from '../../domain/students/students.module';
import { WordsModule } from '../../domain/words/words.module';
import { ReviewService } from './review.service';

@Module({
  imports: [WordsModule, StudentsModule, ReportsModule],
  providers: [ReviewService],
  exports: [ReviewService],
})
export class ReviewModule {}
