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

export enum AiMessageRole {
  USER = 'user',
  ASSISTANT = 'assistant',
}

/**
 * Dialog history used as context for the next turn (last N messages within a
 * time window). `content` holds Anthropic content blocks as-is, including
 * tool_use / tool_result, so the history can be replayed verbatim.
 */
@Entity({ name: 'ai_messages' })
@Check('chk_ai_messages_role', enumCheck('role', AiMessageRole))
@Index('idx_ai_messages_student_created', ['studentId', 'createdAt'])
export class AiMessage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'student_id' })
  studentId!: string;

  @ManyToOne(() => Student, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'student_id' })
  student?: Student;

  @Column({ type: 'varchar', length: 10 })
  role!: AiMessageRole;

  @Column({ type: 'jsonb' })
  content!: unknown;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
