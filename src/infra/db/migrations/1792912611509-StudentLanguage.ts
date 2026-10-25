import { MigrationInterface, QueryRunner } from 'typeorm';

export class StudentLanguage1792912611509 implements MigrationInterface {
  name = 'StudentLanguage1792912611509';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "students" ADD "language" character varying(5)`);
    await queryRunner.query(
      `ALTER TABLE "students" ADD CONSTRAINT "chk_students_language" CHECK ("language" IN ('ru', 'en'))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "students" DROP CONSTRAINT "chk_students_language"`);
    await queryRunner.query(`ALTER TABLE "students" DROP COLUMN "language"`);
  }
}
