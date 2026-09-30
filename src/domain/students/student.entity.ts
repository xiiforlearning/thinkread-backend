import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  Check,
} from 'typeorm';
import { bigintToNumber } from '../../common/transformers';
import { GroupLevel } from '../groups/level';
import { enumCheck } from '../../common/db-checks';
import { ArchiveReason, DialogState, StudentKind, StudentStatus } from './student.enums';

@Entity({ name: 'students' })
@Check('chk_students_kind', enumCheck('kind', StudentKind))
@Check('chk_students_status', enumCheck('status', StudentStatus))
@Check('chk_students_archive_reason', enumCheck('archive_reason', ArchiveReason))
@Check('chk_students_level', enumCheck('level', GroupLevel))
export class Student {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({
    type: 'bigint',
    name: 'telegram_user_id',
    transformer: bigintToNumber,
  })
  telegramUserId!: number;

  /** Real first name, asked at registration (not the Telegram nickname). */
  @Column({ type: 'varchar', name: 'first_name', nullable: true })
  firstName!: string | null;

  @Column({ type: 'varchar', name: 'last_name', nullable: true })
  lastName!: string | null;

  /** Owner's override, e.g. "Акмаль — Upper 16:00"; shown everywhere instead of the name. */
  @Column({ type: 'varchar', name: 'display_name', nullable: true })
  displayName!: string | null;

  @Column({ type: 'varchar', nullable: true })
  username!: string | null;

  @Column({ type: 'varchar', length: 10, default: StudentKind.STUDENT })
  kind!: StudentKind;

  @Index()
  @Column({ type: 'varchar', length: 20 })
  status!: StudentStatus;

  @Column({
    type: 'varchar',
    name: 'archive_reason',
    length: 20,
    nullable: true,
  })
  archiveReason!: ArchiveReason | null;

  /** Cached highest level among the student's groups; recomputed on membership checks. */
  @Column({ type: 'varchar', length: 20, nullable: true })
  level!: GroupLevel | null;

  /** Added by hand without group membership — the monthly check does not archive them. */
  @Column({ type: 'boolean', name: 'manual_access', default: false })
  manualAccess!: boolean;

  @Column({ type: 'jsonb', name: 'dialog_state', default: () => "'{}'" })
  dialogState!: DialogState;

  @Column({ type: 'boolean', name: 'dm_blocked', default: false })
  dmBlocked!: boolean;

  @Column({ type: 'timestamptz', name: 'last_activity_at', nullable: true })
  lastActivityAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'registered_at' })
  registeredAt!: Date;

  @Column({ type: 'timestamptz', name: 'archived_at', nullable: true })
  archivedAt!: Date | null;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
