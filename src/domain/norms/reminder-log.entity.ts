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

export enum ReminderKind {
  READING = 'READING',
  LISTENING = 'LISTENING',
  CARDS = 'CARDS',
}

export enum ReminderChannel {
  /** Sent by the scheduler as a separate message. */
  SCHEDULED = 'SCHEDULED',
  /** Woven by AI into a conversation the student started. */
  WOVEN = 'WOVEN',
}

/**
 * Single source of truth for "was this student already reminded about X in
 * this period". The unique index makes scheduler runs idempotent.
 */
@Entity({ name: 'reminder_log' })
@Check('chk_reminder_log_kind', enumCheck('kind', ReminderKind))
@Check('chk_reminder_log_channel', enumCheck('channel', ReminderChannel))
@Index('uq_reminder_log', ['studentId', 'kind', 'periodKey', 'channel'], {
  unique: true,
})
export class ReminderLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'student_id' })
  studentId!: string;

  @ManyToOne(() => Student, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'student_id' })
  student?: Student;

  @Column({ type: 'varchar', length: 10 })
  kind!: ReminderKind;

  @Column({ type: 'varchar', length: 10 })
  channel!: ReminderChannel;

  /** Local day (`2026-10-01`) — one reminder per item per day. */
  @Column({ type: 'varchar', name: 'period_key', length: 10 })
  periodKey!: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
