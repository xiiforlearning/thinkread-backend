import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Anti-AI signals (advisory only, no auto-penalty):
 * - words_forwarded: today's word list arrived as a forward / via inline bot.
 * - first_check_correct/total: morning typed reverse-recall of the student's
 *   own new words (a strong "did you actually learn them" cross-check).
 * - students.pending_review_word_id: the word currently being self-checked.
 */
export class AddAuthenticitySignals1748900000000 implements MigrationInterface {
  name = 'AddAuthenticitySignals1748900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "daily_reports"
        ADD COLUMN "words_forwarded" BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN "first_check_correct" INTEGER,
        ADD COLUMN "first_check_total" INTEGER
    `);
    await queryRunner.query(`
      ALTER TABLE "students"
        ADD COLUMN "pending_review_word_id" UUID,
        ADD COLUMN "pending_review_remaining" INTEGER
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "students"
        DROP COLUMN "pending_review_remaining",
        DROP COLUMN "pending_review_word_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "daily_reports"
        DROP COLUMN "first_check_total",
        DROP COLUMN "first_check_correct",
        DROP COLUMN "words_forwarded"
    `);
  }
}
