import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ExerciseType } from '../../common/exercise-type';
import { Student } from '../students/student.entity';

@Entity({ name: 'words' })
@Index('idx_words_student_next_review', ['studentId', 'nextReviewAt'])
export class Word {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'student_id' })
  studentId!: string;

  @ManyToOne(() => Student, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'student_id' })
  student?: Student;

  @Column({ type: 'text' })
  word!: string;

  @Column({ type: 'text' })
  translation!: string;

  /** Which exercise this word came from. Reading words are mandatory; listening optional. */
  @Column({ type: 'varchar', name: 'exercise_type', default: 'reading' })
  exerciseType!: ExerciseType;

  @CreateDateColumn({ type: 'timestamptz', name: 'added_at' })
  addedAt!: Date;

  @Column({ type: 'int', name: 'interval_days', default: 1 })
  intervalDays!: number;

  @Column({ type: 'timestamptz', name: 'next_review_at' })
  nextReviewAt!: Date;

  @Column({ type: 'int', name: 'review_count', default: 0 })
  reviewCount!: number;

  @Column({ type: 'int', default: 0 })
  lapses!: number;

  @Column({ type: 'real', default: 2.5 })
  ease!: number;
}
