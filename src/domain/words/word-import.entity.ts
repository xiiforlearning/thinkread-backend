import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Check,
} from 'typeorm';
import { bigintToNumber } from '../../common/transformers';
import { Group } from '../groups/group.entity';
import { Student } from '../students/student.entity';
import { enumCheck } from '../../common/db-checks';
import { ImportStatus } from './word.enums';

export interface WordImportItem {
  word: string;
  translation: string | null;
  /** Already in the target vocabulary — shown in the preview, skipped on confirm. */
  duplicate: boolean;
  /** Unticked by the user in the Mini App preview. */
  excluded?: boolean;
}

/**
 * Preview of a bulk import ("found 40 words, add all?"). Targets either one
 * student or a whole group (teacher import) — exactly one of the two is set.
 */
@Entity({ name: 'word_imports' })
@Check('chk_word_imports_status', enumCheck('status', ImportStatus))
@Check('chk_word_imports_target', '("student_id" IS NULL) <> ("group_chat_id" IS NULL)')
export class WordImport {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'student_id', nullable: true })
  studentId!: string | null;

  @ManyToOne(() => Student, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'student_id' })
  student?: Student;

  @Column({
    type: 'bigint',
    name: 'group_chat_id',
    nullable: true,
    transformer: bigintToNumber,
  })
  groupChatId!: number | null;

  @ManyToOne(() => Group, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'group_chat_id' })
  group?: Group;

  @Column({ type: 'jsonb' })
  items!: WordImportItem[];

  @Column({ type: 'varchar', length: 10, default: ImportStatus.PENDING })
  status!: ImportStatus;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
