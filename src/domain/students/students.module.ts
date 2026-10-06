import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StudentGroup } from './student-group.entity';
import { Student } from './student.entity';
import { StudentsService } from './students.service';

@Module({
  imports: [TypeOrmModule.forFeature([Student, StudentGroup])],
  providers: [StudentsService],
  exports: [StudentsService],
})
export class StudentsModule {}
