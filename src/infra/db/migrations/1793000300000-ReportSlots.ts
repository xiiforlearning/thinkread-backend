import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Submission windows (N1): each report belongs to a window of its week — 1 = Mon–Tue,
 * 2 = Wed–Thu, 3 = Fri–Sun by the local (Asia/Tashkent) day it was handed in. Existing reports
 * are placed by their creation time so past weeks read the same way as new ones.
 */
export class ReportSlots1793000300000 implements MigrationInterface {
  name = 'ReportSlots1793000300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "reports" ADD "slot" smallint`);
    await queryRunner.query(
      `UPDATE "reports" SET "slot" = CASE
         WHEN EXTRACT(ISODOW FROM "created_at" AT TIME ZONE 'Asia/Tashkent') <= 2 THEN 1
         WHEN EXTRACT(ISODOW FROM "created_at" AT TIME ZONE 'Asia/Tashkent') <= 4 THEN 2
         ELSE 3 END`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "reports" DROP COLUMN "slot"`);
  }
}
