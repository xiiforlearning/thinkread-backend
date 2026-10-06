import { MigrationInterface, QueryRunner } from 'typeorm';

export class Vocabulary1790799978114 implements MigrationInterface {
  name = 'Vocabulary1790799978114';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "word_lists" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "title" character varying NOT NULL, "scope" character varying(10) NOT NULL, "group_chat_id" bigint, "level" character varying(20), "created_by" bigint NOT NULL, "status" character varying(10) NOT NULL DEFAULT 'ACTIVE', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "chk_word_lists_target" CHECK (("scope" = 'GROUP' AND "group_chat_id" IS NOT NULL) OR ("scope" = 'LEVEL' AND "level" IS NOT NULL) OR ("scope" = 'ALL')), CONSTRAINT "chk_word_lists_level" CHECK ("level" IN ('PRE_INTERMEDIATE', 'INTERMEDIATE', 'UPPER_INTERMEDIATE', 'ADVANCED', 'IELTS')), CONSTRAINT "chk_word_lists_status" CHECK ("status" IN ('ACTIVE', 'CLOSED')), CONSTRAINT "chk_word_lists_scope" CHECK ("scope" IN ('GROUP', 'LEVEL', 'ALL')), CONSTRAINT "PK_c69d554e55cad3c4e803c3ee109" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "idx_word_lists_status" ON "word_lists" ("status") `);
    await queryRunner.query(
      `CREATE TABLE "word_list_items" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "list_id" uuid NOT NULL, "word" text NOT NULL, "lemma" text NOT NULL, "translation" text, "position" integer NOT NULL DEFAULT '0', CONSTRAINT "PK_5c851e97715796ad79002785f45" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_word_list_items_lemma" ON "word_list_items" ("list_id", "lemma") `,
    );
    await queryRunner.query(
      `CREATE TABLE "word_list_dismissals" ("student_id" uuid NOT NULL, "item_id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_53640f74218b5dff9a6d01afcfe" PRIMARY KEY ("student_id", "item_id"))`,
    );
    await queryRunner.query(`ALTER TABLE "words" ADD "source_list_id" uuid`);
    await queryRunner.query(
      `ALTER TABLE "word_lists" ADD CONSTRAINT "FK_4360eb97e527b87bcd794de3fe6" FOREIGN KEY ("group_chat_id") REFERENCES "groups"("chat_id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "word_list_items" ADD CONSTRAINT "FK_d4475d91a2666b1d0e1a1ef1e40" FOREIGN KEY ("list_id") REFERENCES "word_lists"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "word_list_dismissals" ADD CONSTRAINT "FK_1c40d097128704f42a2fe10c67d" FOREIGN KEY ("item_id") REFERENCES "word_list_items"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "words" ADD CONSTRAINT "FK_22ccf4b9a3ebac401f10efb7606" FOREIGN KEY ("source_list_id") REFERENCES "word_lists"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "words" DROP CONSTRAINT "FK_22ccf4b9a3ebac401f10efb7606"`);
    await queryRunner.query(
      `ALTER TABLE "word_list_dismissals" DROP CONSTRAINT "FK_1c40d097128704f42a2fe10c67d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "word_list_items" DROP CONSTRAINT "FK_d4475d91a2666b1d0e1a1ef1e40"`,
    );
    await queryRunner.query(
      `ALTER TABLE "word_lists" DROP CONSTRAINT "FK_4360eb97e527b87bcd794de3fe6"`,
    );
    await queryRunner.query(`ALTER TABLE "words" DROP COLUMN "source_list_id"`);
    await queryRunner.query(`DROP TABLE "word_list_dismissals"`);
    await queryRunner.query(`DROP INDEX "public"."uq_word_list_items_lemma"`);
    await queryRunner.query(`DROP TABLE "word_list_items"`);
    await queryRunner.query(`DROP INDEX "public"."idx_word_lists_status"`);
    await queryRunner.query(`DROP TABLE "word_lists"`);
  }
}
