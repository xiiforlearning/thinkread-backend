import { MigrationInterface, QueryRunner } from 'typeorm';

/** Per-report language metrics measured by the authenticity check — the baseline for style flags. */
export class ReportMetrics1793000100000 implements MigrationInterface {
  name = 'ReportMetrics1793000100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "reports" ADD "ai_metrics" jsonb`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "reports" DROP COLUMN "ai_metrics"`);
  }
}
