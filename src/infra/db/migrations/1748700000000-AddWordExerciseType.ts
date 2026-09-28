import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tag each word with the exercise it came from ('reading' | 'listening'),
 * so the detailed per-student view can split new words by source. Existing
 * words predate the split and default to 'reading'.
 */
export class AddWordExerciseType1748700000000 implements MigrationInterface {
  name = 'AddWordExerciseType1748700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "words"
        ADD COLUMN "exercise_type" VARCHAR NOT NULL DEFAULT 'reading'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "words" DROP COLUMN "exercise_type"`);
  }
}
