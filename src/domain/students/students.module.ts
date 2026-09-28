import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GroupsModule } from '../groups/groups.module';
import { ReportsModule } from '../reports/reports.module';
import { WordsModule } from '../words/words.module';
import { EveningService } from './evening.service';
import { RegistrationService } from './registration.service';
import { Student } from './student.entity';
import { StudentsService } from './students.service';

@Module({
  imports: [TypeOrmModule.forFeature([Student]), GroupsModule, WordsModule, ReportsModule],
  providers: [StudentsService, RegistrationService, EveningService],
  exports: [StudentsService, RegistrationService, EveningService],
})
export class StudentsModule {}
