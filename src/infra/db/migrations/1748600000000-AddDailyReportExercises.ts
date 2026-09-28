import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * v2 redesign: a class day now tracks two exercises (listening / reading)
 * instead of "read some pages". `counts_as_active` is redefined to mean
 * "did at least one exercise". Historical rows are backfilled so that any
 * previously-active day (words or page submitted) stays active.
 */
export class AddDailyReportExercises1748600000000 implements MigrationInterface {
  name = 'AddDailyReportExercises1748600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "daily_reports"
        ADD COLUMN "did_listening" BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN "did_reading" BOOLEAN NOT NULL DEFAULT FALSE
    `);
    // Preserve active status of historical rows: treat any old submission as
    // a reading exercise so counts_as_active does not flip to false.
    await queryRunner.query(`
      UPDATE "daily_reports"
        SET "did_reading" = TRUE
        WHERE "submitted_words" = TRUE OR "submitted_page" = TRUE
    `);
    await queryRunner.query(`ALTER TABLE "daily_reports" DROP COLUMN "counts_as_active"`);
    await queryRunner.query(`
      ALTER TABLE "daily_reports"
        ADD COLUMN "counts_as_active" BOOLEAN
        GENERATED ALWAYS AS ("did_listening" OR "did_reading") STORED
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "daily_reports" DROP COLUMN "counts_as_active"`);
    await queryRunner.query(`
      ALTER TABLE "daily_reports"
        ADD COLUMN "counts_as_active" BOOLEAN
        GENERATED ALWAYS AS ("submitted_words" OR "submitted_page") STORED
    `);
    await queryRunner.query(`
      ALTER TABLE "daily_reports"
        DROP COLUMN "did_reading",
        DROP COLUMN "did_listening"
    `);
  }
}
