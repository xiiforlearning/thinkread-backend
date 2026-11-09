import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn, Check } from 'typeorm';
import { bigintToNumber } from '../../common/transformers';
import { enumCheck } from '../../common/db-checks';
import { GroupLevel } from './level';

@Entity({ name: 'groups' })
@Check('chk_groups_level', enumCheck('level', GroupLevel))
export class Group {
  /** Telegram chat id (negative for groups). The level is bound to it, not to the title. */
  @PrimaryColumn({
    type: 'bigint',
    name: 'chat_id',
    transformer: bigintToNumber,
  })
  chatId!: number;

  /** The Telegram chat title, refreshed whenever the bot sees the chat. */
  @Column({ type: 'varchar' })
  title!: string;

  /** D12: the owner's own name for the group in the dashboard; null = the Telegram title. */
  @Column({ type: 'varchar', name: 'display_title', nullable: true })
  displayTitle!: string | null;

  /** Set once by the owner; null until then. */
  @Column({ type: 'varchar', length: 20, nullable: true })
  level!: GroupLevel | null;

  /** False once the bot is removed from the group. */
  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive!: boolean;

  @Column({
    type: 'jsonb',
    name: 'teacher_telegram_ids',
    default: () => "'[]'",
  })
  teacherTelegramIds!: number[];

  @Column({
    type: 'timestamptz',
    name: 'teachers_refreshed_at',
    nullable: true,
  })
  teachersRefreshedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}

/** The name the school uses for a group: the owner's, else Telegram's. */
export function groupTitle(g: Pick<Group, 'title' | 'displayTitle'>): string {
  return g.displayTitle?.trim() || g.title;
}
