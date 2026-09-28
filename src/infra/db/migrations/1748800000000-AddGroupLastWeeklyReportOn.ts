import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Idempotency guard for the weekly report's public group post: stores the
 * Friday (end of the reported class week) already posted, so a re-run of the
 * Saturday cron does not double-post in the group.
 */
export class AddGroupLastWeeklyReportOn1748800000000 implements MigrationInterface {
  name = 'AddGroupLastWeeklyReportOn1748800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "groups"
        ADD COLUMN "last_weekly_report_on" DATE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "groups" DROP COLUMN "last_weekly_report_on"`);
  }
}
