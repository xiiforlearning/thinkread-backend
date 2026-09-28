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
import { ListeningMethod } from '../groups/level';
import { enumCheck } from '../../common/db-checks';
import { Student } from '../students/student.entity';

export enum ReportType {
  READING = 'READING',
  LISTENING = 'LISTENING',
}

/**
 * One free-text report parsed by AI. Weekly norms are counted from these rows
 * (reading and listening separately) by `week_start`.
 */
@Entity({ name: 'reports' })
@Check('chk_reports_type', enumCheck('type', ReportType))
@Check('chk_reports_method', enumCheck('method', ListeningMethod))
@Check(
  'chk_reports_pct',
  '"first_pass_pct" BETWEEN 0 AND 100 AND "second_pass_pct" BETWEEN 0 AND 100',
)
@Check('chk_reports_pages', '"pages" IS NULL OR "pages" > 0')
@Index('idx_reports_student_week', ['studentId', 'weekStart', 'type'])
export class Report {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'student_id' })
  studentId!: string;

  @ManyToOne(() => Student, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'student_id' })
  student?: Student;

  @Column({ type: 'varchar', length: 10 })
  type!: ReportType;

  /** Listening only: the method of the student's level at the time of the report. */
  @Column({ type: 'varchar', length: 30, nullable: true })
  method!: ListeningMethod | null;

  /** The student's original message(s). */
  @Column({ type: 'text', name: 'raw_text' })
  rawText!: string;

  /** Book / podcast / series. */
  @Column({ type: 'varchar', name: 'source_title', nullable: true })
  sourceTitle!: string | null;

  /** Episode / scene. */
  @Column({ type: 'varchar', nullable: true })
  episode!: string | null;

  /** Reading only. */
  @Column({ type: 'int', nullable: true })
  pages!: number | null;

  /** Short description (reading) or retelling in the student's own words (listening). */
  @Column({ type: 'text', nullable: true })
  summary!: string | null;

  @Column({ type: 'smallint', name: 'first_pass_pct', nullable: true })
  firstPassPct!: number | null;

  @Column({ type: 'smallint', name: 'second_pass_pct', nullable: true })
  secondPassPct!: number | null;

  @Column({ type: 'smallint', name: 'listen_count', nullable: true })
  listenCount!: number | null;

  @Column({
    type: 'jsonb',
    name: 'unclear_parts',
    default: () => "'[]'",
  })
  unclearParts!: string[];

  /** Full AI parse result, kept for debugging and prompt tuning. */
  @Column({ type: 'jsonb', nullable: true })
  parsed!: Record<string, unknown> | null;

  @Column({ type: 'int', name: 'words_added', default: 0 })
  wordsAdded!: number;

  /** Monday of the local week (Asia/Tashkent) — the week this report counts towards. */
  @Column({ type: 'date', name: 'week_start' })
  weekStart!: string;

  /** Arrived as a forwarded message — an authenticity signal. */
  @Column({ type: 'boolean', name: 'is_forwarded', default: false })
  isForwarded!: boolean;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
