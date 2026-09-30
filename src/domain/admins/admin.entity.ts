import { Column, CreateDateColumn, Entity, PrimaryColumn, Check } from 'typeorm';
import { enumCheck } from '../../common/db-checks';
import { bigintToNumber } from '../../common/transformers';

export enum AdminRole {
  /** The school owner; also always granted via ADMIN_TELEGRAM_ID. */
  OWNER = 'OWNER',
  /** Sees only the students of their own groups. */
  TEACHER = 'TEACHER',
}

/**
 * Explicitly granted staff. Teachers are also detected from the group admin
 * custom title "teacher" (cached in `groups.teacher_telegram_ids`).
 */
@Entity({ name: 'admins' })
@Check('chk_admins_role', enumCheck('role', AdminRole))
export class Admin {
  @PrimaryColumn({
    type: 'bigint',
    name: 'telegram_user_id',
    transformer: bigintToNumber,
  })
  telegramUserId!: number;

  @Column({ type: 'varchar', length: 10 })
  role!: AdminRole;

  @Column({ type: 'varchar', nullable: true })
  name!: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
