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
import { enumCheck } from '../../common/db-checks';
import { Student } from '../students/student.entity';

export enum AiPurpose {
  DIALOG = 'DIALOG',
  AUTHENTICITY = 'AUTHENTICITY',
  SENTENCE_CHECK = 'SENTENCE_CHECK',
  ENRICH_WORDS = 'ENRICH_WORDS',
  PARENT_REPORT = 'PARENT_REPORT',
  /** Teacher's AI chat about one student (dashboard). */
  TEACHER_CHAT = 'TEACHER_CHAT',
}

/** One row per Claude API call — for cost reporting and per-student daily limits. */
@Entity({ name: 'ai_usage' })
@Check('chk_ai_usage_purpose', enumCheck('purpose', AiPurpose))
@Index('idx_ai_usage_created', ['createdAt'])
@Index('idx_ai_usage_student_created', ['studentId', 'createdAt'])
export class AiUsage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Null for school-wide calls (e.g. enriching the shared lexicon). */
  @Column({ type: 'uuid', name: 'student_id', nullable: true })
  studentId!: string | null;

  @ManyToOne(() => Student, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'student_id' })
  student?: Student;

  @Column({ type: 'varchar', length: 20 })
  purpose!: AiPurpose;

  @Column({ type: 'varchar', length: 64 })
  model!: string;

  @Column({ type: 'int', name: 'input_tokens', default: 0 })
  inputTokens!: number;

  @Column({ type: 'int', name: 'cache_read_tokens', default: 0 })
  cacheReadTokens!: number;

  @Column({ type: 'int', name: 'cache_write_tokens', default: 0 })
  cacheWriteTokens!: number;

  @Column({ type: 'int', name: 'output_tokens', default: 0 })
  outputTokens!: number;

  @Column({
    type: 'numeric',
    name: 'cost_usd',
    precision: 10,
    scale: 6,
    default: 0,
  })
  costUsd!: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
