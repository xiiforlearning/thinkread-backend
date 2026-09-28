import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDmBlocked1748200000000 implements MigrationInterface {
  name = 'AddDmBlocked1748200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "students" ADD COLUMN "dm_blocked" BOOLEAN NOT NULL DEFAULT FALSE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "students" DROP COLUMN "dm_blocked"`);
  }
}
