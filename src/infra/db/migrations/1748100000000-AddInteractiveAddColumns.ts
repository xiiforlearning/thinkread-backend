import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInteractiveAddColumns1748100000000 implements MigrationInterface {
  name = 'AddInteractiveAddColumns1748100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "students"
        ADD COLUMN "pending_word" VARCHAR,
        ADD COLUMN "interactive_started_at" TIMESTAMPTZ
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "students"
        DROP COLUMN "interactive_started_at",
        DROP COLUMN "pending_word"
    `);
  }
}
