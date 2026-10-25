import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The school-wide AI chat (dashboard) as a usage purpose. TypeORM does not diff CHECK
 * expressions, so the enum constraint is rewritten by hand.
 */
export class SchoolChat1792911159690 implements MigrationInterface {
  name = 'SchoolChat1792911159690';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "ai_usage" DROP CONSTRAINT "chk_ai_usage_purpose"`);
    await queryRunner.query(
      `ALTER TABLE "ai_usage" ADD CONSTRAINT "chk_ai_usage_purpose" CHECK ("purpose" IN ('DIALOG', 'AUTHENTICITY', 'SENTENCE_CHECK', 'ENRICH_WORDS', 'PARENT_REPORT', 'TEACHER_CHAT', 'SCHOOL_CHAT'))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "ai_usage" WHERE "purpose" = 'SCHOOL_CHAT'`);
    await queryRunner.query(`ALTER TABLE "ai_usage" DROP CONSTRAINT "chk_ai_usage_purpose"`);
    await queryRunner.query(
      `ALTER TABLE "ai_usage" ADD CONSTRAINT "chk_ai_usage_purpose" CHECK ("purpose" IN ('DIALOG', 'AUTHENTICITY', 'SENTENCE_CHECK', 'ENRICH_WORDS', 'PARENT_REPORT', 'TEACHER_CHAT'))`,
    );
  }
}
