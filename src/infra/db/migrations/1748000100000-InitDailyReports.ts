import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitDailyReports1748000100000 implements MigrationInterface {
  name = 'InitDailyReports1748000100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "daily_reports" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "student_id" UUID NOT NULL,
        "date" DATE NOT NULL,
        "words_count" INTEGER NOT NULL DEFAULT 0,
        "page_reached" INTEGER,
        "pages_read_today" INTEGER,
        "submitted_words" BOOLEAN NOT NULL DEFAULT FALSE,
        "submitted_page" BOOLEAN NOT NULL DEFAULT FALSE,
        "counts_as_active" BOOLEAN GENERATED ALWAYS AS (submitted_words OR submitted_page) STORED,
        CONSTRAINT "fk_daily_reports_student" FOREIGN KEY ("student_id") REFERENCES "students" ("id") ON DELETE CASCADE,
        CONSTRAINT "uq_daily_reports_student_date" UNIQUE ("student_id", "date")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_daily_reports_date" ON "daily_reports" ("date")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_daily_reports_date"`);
    await queryRunner.query(`DROP TABLE "daily_reports"`);
  }
}
