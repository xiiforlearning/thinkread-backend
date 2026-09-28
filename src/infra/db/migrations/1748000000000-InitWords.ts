import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitWords1748000000000 implements MigrationInterface {
  name = 'InitWords1748000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "words" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "student_id" UUID NOT NULL,
        "word" TEXT NOT NULL,
        "translation" TEXT NOT NULL,
        "added_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "interval_days" INTEGER NOT NULL DEFAULT 1,
        "next_review_at" TIMESTAMPTZ NOT NULL,
        "review_count" INTEGER NOT NULL DEFAULT 0,
        "lapses" INTEGER NOT NULL DEFAULT 0,
        "ease" REAL NOT NULL DEFAULT 2.5,
        CONSTRAINT "fk_words_student" FOREIGN KEY ("student_id") REFERENCES "students" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_words_student_next_review" ON "words" ("student_id", "next_review_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_words_student_next_review"`);
    await queryRunner.query(`DROP TABLE "words"`);
  }
}
