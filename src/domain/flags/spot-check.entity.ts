import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Check,
} from 'typeorm';
import { Report } from '../reports/report.entity';
import { Student } from '../students/student.entity';
import { enumCheck } from '../../common/db-checks';
import { SpotCheckVerdict } from './flag.enums';

/**
 * A casual question about a recent no-transcript listening report, woven into
 * the next conversation ("by the way, how did it end?"). Not a quiz.
 */
@Entity({ name: 'spot_checks' })
@Check('chk_spot_checks_verdict', enumCheck('verdict', SpotCheckVerdict))
@Index('idx_spot_checks_student', ['studentId', 'createdAt'])
export class SpotCheck {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'student_id' })
  studentId!: string;

  @ManyToOne(() => Student, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'student_id' })
  student?: Student;

  @Column({ type: 'uuid', name: 'report_id' })
  reportId!: string;

  @ManyToOne(() => Report, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'report_id' })
  report?: Report;

  @Column({ type: 'text' })
  question!: string;

  @Column({ type: 'text', nullable: true })
  answer!: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  verdict!: SpotCheckVerdict | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @Column({ type: 'timestamptz', name: 'asked_at', nullable: true })
  askedAt!: Date | null;

  @Column({ type: 'timestamptz', name: 'answered_at', nullable: true })
  answeredAt!: Date | null;
}
