import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitStudents1747800000000 implements MigrationInterface {
  name = 'InitStudents1747800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "students" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "telegram_user_id" BIGINT NOT NULL,
        "chat_id" BIGINT NOT NULL,
        "full_name" VARCHAR NOT NULL,
        "username" VARCHAR,
        "book_title" VARCHAR,
        "book_total_pages" INTEGER,
        "book_start_page" INTEGER NOT NULL DEFAULT 1,
        "current_page" INTEGER,
        "state" VARCHAR NOT NULL DEFAULT 'IDLE',
        "registered_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "fk_students_group" FOREIGN KEY ("chat_id") REFERENCES "groups" ("chat_id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "idx_students_telegram_user_id" ON "students" ("telegram_user_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_students_chat_id" ON "students" ("chat_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_students_chat_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_students_telegram_user_id"`);
    await queryRunner.query(`DROP TABLE "students"`);
  }
}
