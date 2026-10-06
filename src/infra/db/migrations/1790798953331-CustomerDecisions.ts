import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Customer decisions of 30.09.2026: word priority for the review queue, the
 * "no reports in a week" flag replaces "3 weeks in a row", and the teacher's
 * AI chat as a usage purpose. TypeORM does not diff CHECK expressions, so the
 * two enum constraints are rewritten by hand.
 */
export class CustomerDecisions1790798953331 implements MigrationInterface {
  name = 'CustomerDecisions1790798953331';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "words" ADD "priority" character varying(10) NOT NULL DEFAULT 'NORMAL'`,
    );
    await queryRunner.query(
      `ALTER TABLE "words" ADD CONSTRAINT "chk_words_priority" CHECK ("priority" IN ('HIGH', 'NORMAL'))`,
    );
    await queryRunner.query(`ALTER TABLE "flags" DROP CONSTRAINT "chk_flags_kind"`);
    await queryRunner.query(
      `UPDATE "flags" SET "kind" = 'NORM_MISSED_WEEK' WHERE "kind" = 'NORM_MISSED_3_WEEKS'`,
    );
    await queryRunner.query(
      `ALTER TABLE "flags" ADD CONSTRAINT "chk_flags_kind" CHECK ("kind" IN ('STYLE_MISMATCH', 'TOO_POLISHED', 'PCT_JUMP', 'GENERIC_RETELLING', 'REPEATED_RETELLING', 'FORWARDED', 'SPOT_CHECK_FAILED', 'NORM_MISSED_WEEK'))`,
    );
    await queryRunner.query(`ALTER TABLE "ai_usage" DROP CONSTRAINT "chk_ai_usage_purpose"`);
    await queryRunner.query(
      `ALTER TABLE "ai_usage" ADD CONSTRAINT "chk_ai_usage_purpose" CHECK ("purpose" IN ('DIALOG', 'AUTHENTICITY', 'SENTENCE_CHECK', 'ENRICH_WORDS', 'PARENT_REPORT', 'TEACHER_CHAT'))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "ai_usage" WHERE "purpose" = 'TEACHER_CHAT'`);
    await queryRunner.query(`ALTER TABLE "ai_usage" DROP CONSTRAINT "chk_ai_usage_purpose"`);
    await queryRunner.query(
      `ALTER TABLE "ai_usage" ADD CONSTRAINT "chk_ai_usage_purpose" CHECK ("purpose" IN ('DIALOG', 'AUTHENTICITY', 'SENTENCE_CHECK', 'ENRICH_WORDS', 'PARENT_REPORT'))`,
    );
    await queryRunner.query(`ALTER TABLE "flags" DROP CONSTRAINT "chk_flags_kind"`);
    await queryRunner.query(
      `UPDATE "flags" SET "kind" = 'NORM_MISSED_3_WEEKS' WHERE "kind" = 'NORM_MISSED_WEEK'`,
    );
    await queryRunner.query(
      `ALTER TABLE "flags" ADD CONSTRAINT "chk_flags_kind" CHECK ("kind" IN ('STYLE_MISMATCH', 'TOO_POLISHED', 'PCT_JUMP', 'GENERIC_RETELLING', 'REPEATED_RETELLING', 'FORWARDED', 'SPOT_CHECK_FAILED', 'NORM_MISSED_3_WEEKS'))`,
    );
    await queryRunner.query(`ALTER TABLE "words" DROP CONSTRAINT "chk_words_priority"`);
    await queryRunner.query(`ALTER TABLE "words" DROP COLUMN "priority"`);
  }
}
