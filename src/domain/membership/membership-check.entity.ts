import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export interface MembershipCheckDetails {
  archived: string[];
  restored: string[];
  levelChanged: string[];
  /** Groups the bot could not query (e.g. removed from the group) — their students were not archived. */
  failedGroups: number[];
}

/** One run of the monthly membership check (history shown in the admin UI). */
@Entity({ name: 'membership_checks' })
export class MembershipCheck {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'timestamptz', name: 'started_at', default: () => 'now()' })
  startedAt!: Date;

  @Column({ type: 'timestamptz', name: 'finished_at', nullable: true })
  finishedAt!: Date | null;

  @Column({ type: 'int', default: 0 })
  checked!: number;

  @Column({ type: 'int', default: 0 })
  archived!: number;

  @Column({ type: 'int', default: 0 })
  restored!: number;

  @Column({ type: 'int', name: 'level_changed', default: 0 })
  levelChanged!: number;

  @Column({ type: 'jsonb', nullable: true })
  details!: MembershipCheckDetails | null;
}
