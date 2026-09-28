import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Student } from '../students/student.entity';

@Entity({ name: 'daily_reports' })
@Index('uq_daily_reports_student_date', ['studentId', 'date'], { unique: true })
export class DailyReport {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'student_id' })
  studentId!: string;

  @ManyToOne(() => Student, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'student_id' })
  student?: Student;

  @Column({ type: 'date' })
  date!: string;

  @Column({ type: 'int', name: 'words_count', default: 0 })
  wordsCount!: number;

  @Column({ type: 'int', name: 'page_reached', nullable: true })
  pageReached!: number | null;

  @Column({ type: 'int', name: 'pages_read_today', nullable: true })
  pagesReadToday!: number | null;

  @Column({ type: 'boolean', name: 'submitted_words', default: false })
  submittedWords!: boolean;

  @Column({ type: 'boolean', name: 'submitted_page', default: false })
  submittedPage!: boolean;

  /** Student reported doing the listening exercise on this class day. */
  @Column({ type: 'boolean', name: 'did_listening', default: false })
  didListening!: boolean;

  /** Student reported doing the reading exercise on this class day. */
  @Column({ type: 'boolean', name: 'did_reading', default: false })
  didReading!: boolean;

  /** How many flashcards the student answered this day (morning review + /review). */
  @Column({ type: 'int', name: 'reviewed_count', default: 0 })
  reviewedCount!: number;

  // --- Anti-AI signals (advisory only) ---

  /** Today's word submission arrived as a forward / via inline bot. */
  @Column({ type: 'boolean', name: 'words_forwarded', default: false })
  wordsForwarded!: boolean;

  /** Correct answers on the morning typed reverse-recall of the student's own words. */
  @Column({ type: 'int', name: 'first_check_correct', nullable: true })
  firstCheckCorrect!: number | null;

  /** Total morning self-check questions asked this day. */
  @Column({ type: 'int', name: 'first_check_total', nullable: true })
  firstCheckTotal!: number | null;

  // Stored generated column; defined in migration. Read-only here.
  @Column({
    type: 'boolean',
    name: 'counts_as_active',
    generatedType: 'STORED',
    asExpression: 'did_listening OR did_reading',
    insert: false,
    update: false,
  })
  countsAsActive!: boolean;
}
