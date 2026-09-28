import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGroupTeacherIds1748300000000 implements MigrationInterface {
  name = 'AddGroupTeacherIds1748300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "groups"
        ADD COLUMN "teacher_telegram_ids" JSONB NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN "teachers_refreshed_at" TIMESTAMPTZ
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "groups"
        DROP COLUMN "teachers_refreshed_at",
        DROP COLUMN "teacher_telegram_ids"
    `);
  }
}
