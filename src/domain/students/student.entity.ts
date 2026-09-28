import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { bigintToNumber } from '../../common/transformers';
import { StudentState } from './student-state.enum';

@Entity({ name: 'students' })
export class Student {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'bigint', name: 'telegram_user_id', transformer: bigintToNumber })
  telegramUserId!: number;

  @Index()
  @Column({ type: 'bigint', name: 'chat_id', transformer: bigintToNumber })
  chatId!: number;

  @Column({ type: 'varchar', name: 'full_name' })
  fullName!: string;

  @Column({ type: 'varchar', nullable: true })
  username!: string | null;

  @Column({ type: 'varchar', name: 'book_title', nullable: true })
  bookTitle!: string | null;

  @Column({ type: 'int', name: 'book_total_pages', nullable: true })
  bookTotalPages!: number | null;

  @Column({ type: 'int', name: 'book_start_page', default: 1 })
  bookStartPage!: number;

  @Column({ type: 'int', name: 'current_page', nullable: true })
  currentPage!: number | null;

  @Column({ type: 'varchar', enum: StudentState, default: StudentState.IDLE })
  state!: StudentState;

  @Column({ type: 'varchar', name: 'pending_word', nullable: true })
  pendingWord!: string | null;

  /** Anti-AI morning self-check: the word id currently being reverse-recalled. */
  @Column({ type: 'uuid', name: 'pending_review_word_id', nullable: true })
  pendingReviewWordId!: string | null;

  /** Cards remaining in the review session after the pending recall card. */
  @Column({ type: 'int', name: 'pending_review_remaining', nullable: true })
  pendingReviewRemaining!: number | null;

  @Column({ type: 'timestamptz', name: 'interactive_started_at', nullable: true })
  interactiveStartedAt!: Date | null;

  @Column({ type: 'boolean', name: 'dm_blocked', default: false })
  dmBlocked!: boolean;

  @CreateDateColumn({ type: 'timestamptz', name: 'registered_at' })
  registeredAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
