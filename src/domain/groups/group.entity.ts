import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { bigintToNumber } from '../../common/transformers';

@Entity({ name: 'groups' })
export class Group {
  @PrimaryColumn({ type: 'bigint', name: 'chat_id', transformer: bigintToNumber })
  chatId!: number;

  @Column({ type: 'varchar' })
  title!: string;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive!: boolean;

  @Column({ type: 'time', name: 'morning_time', default: '08:00' })
  morningTime!: string;

  @Column({ type: 'time', name: 'evening_time', default: '20:00' })
  eveningTime!: string;

  @Column({ type: 'jsonb', name: 'teacher_telegram_ids', default: () => "'[]'::jsonb" })
  teacherTelegramIds!: number[];

  @Column({ type: 'timestamptz', name: 'teachers_refreshed_at', nullable: true })
  teachersRefreshedAt!: Date | null;

  /**
   * Controls the public group post of the weekly report. The cron always
   * DMs the report to the group's teachers; this flag is *additional*:
   * - true (default): also post the report in the group chat.
   * - false: a teacher opted out of the public post, so it goes to teacher DMs only.
   */
  @Column({ type: 'boolean', name: 'group_reports_enabled', default: true })
  groupReportsEnabled!: boolean;

  /**
   * Friday (YYYY-MM-DD, local) of the last class week already posted publicly.
   * Idempotency guard so the Saturday weekly cron does not double-post.
   */
  @Column({ type: 'date', name: 'last_weekly_report_on', nullable: true })
  lastWeeklyReportOn!: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
