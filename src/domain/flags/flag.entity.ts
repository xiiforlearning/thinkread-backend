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
import { FlagDetails, FlagKind, FlagStatus } from './flag.enums';

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

  /** The first signal raised; `kinds` carries all of them (one card per report). */
  @Column({ type: 'varchar', length: 30 })
  kind!: FlagKind;

  /** Every signal raised on this report, in the order they were found. */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  kinds!: FlagKind[];

  /** Human-readable explanation for the teacher: the per-kind reasons, one per line. */
  @Column({ type: 'text' })
  reason!: string;

  /** Per-kind reasons and claims with quotes, the metrics behind a style flag. */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  details!: FlagDetails;

  @Column({ type: 'varchar', length: 10, default: FlagStatus.NEW })
  status!: FlagStatus;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @Column({ type: 'timestamptz', name: 'reviewed_at', nullable: true })
  reviewedAt!: Date | null;
}
