import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * One flag card per report. `kinds` carries every signal raised on the report, `details` the
 * per-kind reasons (and, later, cited claims and metrics). Open duplicates that the old
 * one-card-per-kind code created for the same report are merged into the earliest card.
 */
export class FlagsPerReport1793000000000 implements MigrationInterface {
  name = 'FlagsPerReport1793000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "flags" ADD "kinds" jsonb NOT NULL DEFAULT '[]'`);
    await queryRunner.query(`ALTER TABLE "flags" ADD "details" jsonb NOT NULL DEFAULT '{}'`);
    await queryRunner.query(
      `UPDATE "flags" SET "kinds" = jsonb_build_array("kind"),
         "details" = jsonb_build_object('reasons', jsonb_build_object("kind", "reason"))`,
    );
    // Merge open cards of one report: the earliest keeps all kinds and the distinct reasons.
    await queryRunner.query(`
      WITH dup AS (
        SELECT "report_id" FROM "flags"
        WHERE "report_id" IS NOT NULL AND "status" = 'NEW'
        GROUP BY "report_id" HAVING count(*) > 1
      ), keep AS (
        SELECT DISTINCT ON (f."report_id") f."id", f."report_id"
        FROM "flags" f JOIN dup USING ("report_id")
        WHERE f."status" = 'NEW'
        ORDER BY f."report_id", f."created_at", f."id"
      ), agg AS (
        SELECT f."report_id",
               to_jsonb(array_agg(f."kind" ORDER BY f."created_at", f."id")) AS kinds,
               string_agg(DISTINCT f."reason", E'\\n') AS reason,
               jsonb_object_agg(f."kind", f."reason") AS reasons
        FROM "flags" f JOIN dup USING ("report_id")
        WHERE f."status" = 'NEW'
        GROUP BY f."report_id"
      )
      UPDATE "flags" f
      SET "kinds" = a.kinds, "reason" = a.reason, "details" = jsonb_build_object('reasons', a.reasons)
      FROM agg a JOIN keep k ON k."report_id" = a."report_id"
      WHERE f."id" = k."id"
    `);
    await queryRunner.query(`
      DELETE FROM "flags" f
      USING (
        SELECT "report_id" FROM "flags"
        WHERE "report_id" IS NOT NULL AND "status" = 'NEW'
        GROUP BY "report_id" HAVING count(*) > 1
      ) dup
      WHERE f."report_id" = dup."report_id" AND f."status" = 'NEW'
        AND f."id" <> (
          SELECT k."id" FROM "flags" k
          WHERE k."report_id" = f."report_id" AND k."status" = 'NEW'
          ORDER BY k."created_at", k."id" LIMIT 1
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Merged cards stay merged; the columns go.
    await queryRunner.query(`ALTER TABLE "flags" DROP COLUMN "details"`);
    await queryRunner.query(`ALTER TABLE "flags" DROP COLUMN "kinds"`);
  }
}
