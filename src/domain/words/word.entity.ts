import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  Check,
} from 'typeorm';
import { Report } from '../reports/report.entity';
import { Student } from '../students/student.entity';
import { enumCheck } from '../../common/db-checks';
import { CardStage, CefrLevel, WordPriority, WordSource, WordStatus } from './word.enums';

/**
 * A word in a student's personal vocabulary. Uniqueness is
 * `(student_id, lower(word))` — a functional index that TypeORM cannot
 * express, so it is written by hand in the migration and declared here with
 * `synchronize: false` so `migration:generate` does not try to drop it.
 */
@Entity({ name: 'words' })
@Check('chk_words_status', enumCheck('status', WordStatus))
@Check('chk_words_cefr', enumCheck('cefr', CefrLevel))
@Check('chk_words_stage', enumCheck('stage', CardStage))
@Check('chk_words_source', enumCheck('source', WordSource))
@Check('chk_words_priority', enumCheck('priority', WordPriority))
@Index('idx_words_student_due', ['studentId', 'status', 'nextDueAt'])
@Index('uq_words_student_word', { synchronize: false })
export class Word {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'student_id' })
  studentId!: string;

  @ManyToOne(() => Student, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'student_id' })
  student?: Student;

  /** Word or phrase as it will be shown. */
  @Column({ type: 'text' })
  word!: string;

  /** Normalized lemma — the key into `word_lexicon`. */
  @Column({ type: 'text', nullable: true })
  lemma!: string | null;

  @Column({ type: 'text', nullable: true })
  translation!: string | null;

  @Column({ type: 'text', nullable: true })
  example!: string | null;

  @Column({ type: 'varchar', length: 2, nullable: true })
  cefr!: CefrLevel | null;

  @Column({ type: 'varchar', length: 10, default: WordStatus.LEARNING })
  status!: WordStatus;

  /** Queue priority for cards; never changes intervals or stages. */
  @Column({ type: 'varchar', length: 10, default: WordPriority.NORMAL })
  priority!: WordPriority;

  @Column({ type: 'smallint', default: CardStage.TRANSLATION })
  stage!: CardStage;

  /** Correct answers on the current stage. */
  @Column({ type: 'smallint', name: 'stage_correct', default: 0 })
  stageCorrect!: number;

  /** Total correct answers across stages — drives the review interval. */
  @Column({ type: 'int', name: 'correct_total', default: 0 })
  correctTotal!: number;

  @Column({ type: 'timestamptz', name: 'next_due_at', default: () => 'now()' })
  nextDueAt!: Date;

  @Column({ type: 'varchar', length: 20 })
  source!: WordSource;

  @Column({ type: 'uuid', name: 'source_report_id', nullable: true })
  sourceReportId!: string | null;

  @ManyToOne(() => Report, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'source_report_id' })
  sourceReport?: Report;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @Column({ type: 'timestamptz', name: 'learned_at', nullable: true })
  learnedAt!: Date | null;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
