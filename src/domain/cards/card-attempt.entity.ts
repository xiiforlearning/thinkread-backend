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
import { Student } from '../students/student.entity';
import { CardStage } from '../words/word.enums';
import { enumCheck } from '../../common/db-checks';
import { Word } from '../words/word.entity';

export enum CardChannel {
  BOT = 'BOT',
  MINI_APP = 'MINI_APP',
}

/** What the student was shown — enough to check the answer without AI for stages 1–2. */
export interface CardPrompt {
  question: string;
  options?: string[];
  hint?: string;
  acceptedAnswers?: string[];
}

/**
 * One shown card. Created when the card is shown (answer null), completed when
 * answered or skipped. The daily cards norm counts answered attempts.
 */
@Entity({ name: 'card_attempts' })
@Check('chk_card_attempts_stage', enumCheck('stage', CardStage))
@Check('chk_card_attempts_channel', enumCheck('channel', CardChannel))
@Index('idx_card_attempts_student_created', ['studentId', 'createdAt'])
export class CardAttempt {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'student_id' })
  studentId!: string;

  @ManyToOne(() => Student, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'student_id' })
  student?: Student;

  @Column({ type: 'uuid', name: 'word_id' })
  wordId!: string;

  @ManyToOne(() => Word, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'word_id' })
  word?: Word;

  @Column({ type: 'smallint' })
  stage!: CardStage;

  @Column({ type: 'jsonb' })
  prompt!: CardPrompt;

  @Column({ type: 'text', nullable: true })
  answer!: string | null;

  /** Null until answered. */
  @Column({ type: 'boolean', name: 'is_correct', nullable: true })
  isCorrect!: boolean | null;

  @Column({ type: 'boolean', default: false })
  skipped!: boolean;

  /** Soft grammar hint for stage 3 (never blocks progress). */
  @Column({ type: 'text', nullable: true })
  feedback!: string | null;

  @Column({ type: 'varchar', length: 10 })
  channel!: CardChannel;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @Column({ type: 'timestamptz', name: 'answered_at', nullable: true })
  answeredAt!: Date | null;
}
