import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Words of a report are confirmed by the student before the report counts (customer decision
 * 02.11.2026): a report may be confirmed without new words (`no_new_words`), several such in a
 * row raise the quiet NO_NEW_WORDS flag, and the word list is extracted by its own AI call
 * (REPORT_WORDS purpose). TypeORM does not diff CHECK expressions, so both are rewritten by hand.
 */
export class ReportWords1793000200000 implements MigrationInterface {
  name = 'ReportWords1793000200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "reports" ADD "no_new_words" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(`ALTER TABLE "flags" DROP CONSTRAINT "chk_flags_kind"`);
    await queryRunner.query(
      `ALTER TABLE "flags" ADD CONSTRAINT "chk_flags_kind" CHECK ("kind" IN ('STYLE_MISMATCH', 'TOO_POLISHED', 'PCT_JUMP', 'GENERIC_RETELLING', 'REPEATED_RETELLING', 'FORWARDED', 'SPOT_CHECK_FAILED', 'NORM_MISSED_WEEK', 'NO_NEW_WORDS'))`,
    );
    await queryRunner.query(`ALTER TABLE "ai_usage" DROP CONSTRAINT "chk_ai_usage_purpose"`);
    await queryRunner.query(
      `ALTER TABLE "ai_usage" ADD CONSTRAINT "chk_ai_usage_purpose" CHECK ("purpose" IN ('DIALOG', 'AUTHENTICITY', 'SENTENCE_CHECK', 'ENRICH_WORDS', 'PARENT_REPORT', 'TEACHER_CHAT', 'SCHOOL_CHAT', 'REPORT_WORDS'))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "ai_usage" WHERE "purpose" = 'REPORT_WORDS'`);
    await queryRunner.query(`ALTER TABLE "ai_usage" DROP CONSTRAINT "chk_ai_usage_purpose"`);
    await queryRunner.query(
      `ALTER TABLE "ai_usage" ADD CONSTRAINT "chk_ai_usage_purpose" CHECK ("purpose" IN ('DIALOG', 'AUTHENTICITY', 'SENTENCE_CHECK', 'ENRICH_WORDS', 'PARENT_REPORT', 'TEACHER_CHAT', 'SCHOOL_CHAT'))`,
    );
    await queryRunner.query(`DELETE FROM "flags" WHERE "kind" = 'NO_NEW_WORDS'`);
    await queryRunner.query(`ALTER TABLE "flags" DROP CONSTRAINT "chk_flags_kind"`);
    await queryRunner.query(
      `ALTER TABLE "flags" ADD CONSTRAINT "chk_flags_kind" CHECK ("kind" IN ('STYLE_MISMATCH', 'TOO_POLISHED', 'PCT_JUMP', 'GENERIC_RETELLING', 'REPEATED_RETELLING', 'FORWARDED', 'SPOT_CHECK_FAILED', 'NORM_MISSED_WEEK'))`,
    );
    await queryRunner.query(`ALTER TABLE "reports" DROP COLUMN "no_new_words"`);
  }
}
