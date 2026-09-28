import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitGroups1715000000000 implements MigrationInterface {
  name = 'InitGroups1715000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "groups" (
        "chat_id" BIGINT PRIMARY KEY,
        "title" VARCHAR NOT NULL,
        "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
        "morning_time" TIME NOT NULL DEFAULT '08:00',
        "evening_time" TIME NOT NULL DEFAULT '20:00',
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "groups"`);
  }
}
