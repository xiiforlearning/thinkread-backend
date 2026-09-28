import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Owner-editable overrides of `globalConfig` (norms, reminder times,
 * thresholds). A missing key falls back to the default in code.
 */
@Entity({ name: 'settings' })
export class Setting {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  key!: string;

  @Column({ type: 'jsonb' })
  value!: unknown;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
