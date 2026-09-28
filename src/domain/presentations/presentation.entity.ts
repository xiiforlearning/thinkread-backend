import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Student } from '../students/student.entity';

@Entity({ name: 'presentations' })
@Index('idx_presentations_student_done', ['studentId', 'done'])
export class Presentation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'student_id' })
  studentId!: string;

  @ManyToOne(() => Student, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'student_id' })
  student?: Student;

  @CreateDateColumn({ type: 'timestamptz', name: 'assigned_at' })
  assignedAt!: Date;

  @Column({ type: 'text', nullable: true })
  topic!: string | null;

  @Column({ type: 'boolean', default: false })
  done!: boolean;
}
