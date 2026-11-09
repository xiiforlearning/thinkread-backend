import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * W5: words can be removed (status REMOVED — the row stays). D12: a group can carry its own
 * name in the dashboard (`display_title`), the Telegram title keeps arriving in `title`.
 * TypeORM does not diff CHECK expressions, so the status constraint is rewritten by hand.
 */
export class WordRemovalGroupTitle1793000400000 implements MigrationInterface {
  name = 'WordRemovalGroupTitle1793000400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "words" DROP CONSTRAINT "chk_words_status"`);
    await queryRunner.query(
      `ALTER TABLE "words" ADD CONSTRAINT "chk_words_status" CHECK ("status" IN ('LEARNING', 'LEARNED', 'REMOVED'))`,
    );
    await queryRunner.query(`ALTER TABLE "groups" ADD "display_title" character varying`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "groups" DROP COLUMN "display_title"`);
    await queryRunner.query(`UPDATE "words" SET "status" = 'LEARNED' WHERE "status" = 'REMOVED'`);
    await queryRunner.query(`ALTER TABLE "words" DROP CONSTRAINT "chk_words_status"`);
    await queryRunner.query(
      `ALTER TABLE "words" ADD CONSTRAINT "chk_words_status" CHECK ("status" IN ('LEARNING', 'LEARNED'))`,
    );
  }
}
