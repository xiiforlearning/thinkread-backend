import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitPresentations1748000200000 implements MigrationInterface {
  name = 'InitPresentations1748000200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "presentations" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "student_id" UUID NOT NULL,
        "assigned_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "topic" TEXT,
        "done" BOOLEAN NOT NULL DEFAULT FALSE,
        CONSTRAINT "fk_presentations_student" FOREIGN KEY ("student_id") REFERENCES "students" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_presentations_student_done" ON "presentations" ("student_id", "done")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_presentations_student_done"`);
    await queryRunner.query(`DROP TABLE "presentations"`);
  }
}
