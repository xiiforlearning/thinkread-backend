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
import { FlagKind, FlagStatus } from './flag.enums';

@Entity({ name: 'flags' })
@Check('chk_flags_kind', enumCheck('kind', FlagKind))
@Check('chk_flags_status', enumCheck('status', FlagStatus))
@Index('idx_flags_status_created', ['status', 'createdAt'])
@Index('idx_flags_student', ['studentId'])
export class Flag {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'student_id' })
  studentId!: string;

  @ManyToOne(() => Student, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'student_id' })
  student?: Student;

  /** Null for flags not tied to one report (e.g. NORM_MISSED_WEEK). */
  @Column({ type: 'uuid', name: 'report_id', nullable: true })
  reportId!: string | null;

  @ManyToOne(() => Report, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'report_id' })
  report?: Report;

  @Column({ type: 'varchar', length: 30 })
  kind!: FlagKind;

  /** Human-readable explanation for the teacher. */
  @Column({ type: 'text' })
  reason!: string;

  @Column({ type: 'varchar', length: 10, default: FlagStatus.NEW })
  status!: FlagStatus;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @Column({ type: 'timestamptz', name: 'reviewed_at', nullable: true })
  reviewedAt!: Date | null;
}
