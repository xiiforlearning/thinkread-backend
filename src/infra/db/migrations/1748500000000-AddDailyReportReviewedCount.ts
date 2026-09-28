import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDailyReportReviewedCount1748500000000 implements MigrationInterface {
  name = 'AddDailyReportReviewedCount1748500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "daily_reports"
        ADD COLUMN "reviewed_count" INTEGER NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "daily_reports"
        DROP COLUMN "reviewed_count"
    `);
  }
}
