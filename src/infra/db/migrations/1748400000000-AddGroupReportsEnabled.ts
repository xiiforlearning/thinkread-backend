import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGroupReportsEnabled1748400000000 implements MigrationInterface {
  name = 'AddGroupReportsEnabled1748400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "groups"
        ADD COLUMN "group_reports_enabled" BOOLEAN NOT NULL DEFAULT TRUE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "groups"
        DROP COLUMN "group_reports_enabled"
    `);
  }
}
