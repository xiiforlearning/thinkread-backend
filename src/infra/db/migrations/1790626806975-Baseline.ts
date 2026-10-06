import { MigrationInterface, QueryRunner } from 'typeorm';

export class Baseline1790626806975 implements MigrationInterface {
  name = 'Baseline1790626806975';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(
      `CREATE TABLE "groups" ("chat_id" bigint NOT NULL, "title" character varying NOT NULL, "level" character varying(20), "is_active" boolean NOT NULL DEFAULT true, "teacher_telegram_ids" jsonb NOT NULL DEFAULT '[]', "teachers_refreshed_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "chk_groups_level" CHECK ("level" IN ('PRE_INTERMEDIATE', 'INTERMEDIATE', 'UPPER_INTERMEDIATE', 'ADVANCED', 'IELTS')), CONSTRAINT "PK_a3fbd3aa034e77d2a9edb3d53a1" PRIMARY KEY ("chat_id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "students" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "telegram_user_id" bigint NOT NULL, "first_name" character varying, "last_name" character varying, "display_name" character varying, "username" character varying, "kind" character varying(10) NOT NULL DEFAULT 'STUDENT', "status" character varying(20) NOT NULL, "archive_reason" character varying(20), "level" character varying(20), "manual_access" boolean NOT NULL DEFAULT false, "dialog_state" jsonb NOT NULL DEFAULT '{}', "dm_blocked" boolean NOT NULL DEFAULT false, "last_activity_at" TIMESTAMP WITH TIME ZONE, "registered_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "archived_at" TIMESTAMP WITH TIME ZONE, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "chk_students_level" CHECK ("level" IN ('PRE_INTERMEDIATE', 'INTERMEDIATE', 'UPPER_INTERMEDIATE', 'ADVANCED', 'IELTS')), CONSTRAINT "chk_students_archive_reason" CHECK ("archive_reason" IN ('LEFT_GROUP', 'MANUAL')), CONSTRAINT "chk_students_status" CHECK ("status" IN ('PENDING_NAME', 'ACTIVE', 'ARCHIVED')), CONSTRAINT "chk_students_kind" CHECK ("kind" IN ('STUDENT', 'LEAD')), CONSTRAINT "PK_7d7f07271ad4ce999880713f05e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_7e3cc69289c6289805172b624a" ON "students" ("telegram_user_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_89d97b30d7d2b126c22e4fb28d" ON "students" ("status") `,
    );
    await queryRunner.query(
      `CREATE TABLE "word_imports" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "student_id" uuid, "group_chat_id" bigint, "items" jsonb NOT NULL, "status" character varying(10) NOT NULL DEFAULT 'PENDING', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "chk_word_imports_target" CHECK (("student_id" IS NULL) <> ("group_chat_id" IS NULL)), CONSTRAINT "chk_word_imports_status" CHECK ("status" IN ('PENDING', 'CONFIRMED', 'CANCELLED', 'EXPIRED')), CONSTRAINT "PK_9b134ebc9cef53b7982add767a3" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "reports" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "student_id" uuid NOT NULL, "type" character varying(10) NOT NULL, "method" character varying(30), "raw_text" text NOT NULL, "source_title" character varying, "episode" character varying, "pages" integer, "summary" text, "first_pass_pct" smallint, "second_pass_pct" smallint, "listen_count" smallint, "unclear_parts" jsonb NOT NULL DEFAULT '[]', "parsed" jsonb, "words_added" integer NOT NULL DEFAULT '0', "week_start" date NOT NULL, "is_forwarded" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "chk_reports_pages" CHECK ("pages" IS NULL OR "pages" > 0), CONSTRAINT "chk_reports_pct" CHECK ("first_pass_pct" BETWEEN 0 AND 100 AND "second_pass_pct" BETWEEN 0 AND 100), CONSTRAINT "chk_reports_method" CHECK ("method" IN ('PODCAST_WITH_SCRIPT', 'SERIES', 'PODCAST_NO_TRANSCRIPT')), CONSTRAINT "chk_reports_type" CHECK ("type" IN ('READING', 'LISTENING')), CONSTRAINT "PK_d9013193989303580053c0b5ef6" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_reports_student_week" ON "reports" ("student_id", "week_start", "type") `,
    );
    await queryRunner.query(
      `CREATE TABLE "words" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "student_id" uuid NOT NULL, "word" text NOT NULL, "lemma" text, "translation" text, "example" text, "cefr" character varying(2), "status" character varying(10) NOT NULL DEFAULT 'LEARNING', "stage" smallint NOT NULL DEFAULT '1', "stage_correct" smallint NOT NULL DEFAULT '0', "correct_total" integer NOT NULL DEFAULT '0', "next_due_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "source" character varying(20) NOT NULL, "source_report_id" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "learned_at" TIMESTAMP WITH TIME ZONE, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "chk_words_source" CHECK ("source" IN ('READING', 'PODCAST', 'SERIES', 'MANUAL', 'IMPORT', 'TEACHER')), CONSTRAINT "chk_words_stage" CHECK ("stage" IN (1, 2, 3)), CONSTRAINT "chk_words_cefr" CHECK ("cefr" IN ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')), CONSTRAINT "chk_words_status" CHECK ("status" IN ('LEARNING', 'LEARNED')), CONSTRAINT "PK_feaf97accb69a7f355fa6f58a3d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_words_student_due" ON "words" ("student_id", "status", "next_due_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "word_lexicon" ("lemma" text NOT NULL, "translation" text NOT NULL, "examples" jsonb NOT NULL DEFAULT '[]', "cefr" character varying(2), "forms" jsonb NOT NULL DEFAULT '[]', "gap_sentences" jsonb NOT NULL DEFAULT '[]', "distractors" jsonb NOT NULL DEFAULT '[]', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "chk_word_lexicon_cefr" CHECK ("cefr" IN ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')), CONSTRAINT "PK_2baf9f33536213aeb74353225ac" PRIMARY KEY ("lemma"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "settings" ("key" character varying(64) NOT NULL, "value" jsonb NOT NULL, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_c8639b7626fa94ba8265628f214" PRIMARY KEY ("key"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "student_groups" ("student_id" uuid NOT NULL, "group_chat_id" bigint NOT NULL, "is_member" boolean NOT NULL DEFAULT true, "joined_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "checked_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_b16b2354ea29b1c0364ad78feae" PRIMARY KEY ("student_id", "group_chat_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_student_groups_group" ON "student_groups" ("group_chat_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "reminder_log" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "student_id" uuid NOT NULL, "kind" character varying(10) NOT NULL, "channel" character varying(10) NOT NULL, "period_key" character varying(10) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "chk_reminder_log_channel" CHECK ("channel" IN ('SCHEDULED', 'WOVEN')), CONSTRAINT "chk_reminder_log_kind" CHECK ("kind" IN ('READING', 'LISTENING', 'CARDS')), CONSTRAINT "PK_c113d227b2fabdbdb73f91c7456" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_reminder_log" ON "reminder_log" ("student_id", "kind", "period_key", "channel") `,
    );
    await queryRunner.query(
      `CREATE TABLE "membership_checks" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "started_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "finished_at" TIMESTAMP WITH TIME ZONE, "checked" integer NOT NULL DEFAULT '0', "archived" integer NOT NULL DEFAULT '0', "restored" integer NOT NULL DEFAULT '0', "level_changed" integer NOT NULL DEFAULT '0', "details" jsonb, CONSTRAINT "PK_9c69df9a3d34d2bb0d80639b77e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "spot_checks" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "student_id" uuid NOT NULL, "report_id" uuid NOT NULL, "question" text NOT NULL, "answer" text, "verdict" character varying(10), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "asked_at" TIMESTAMP WITH TIME ZONE, "answered_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "chk_spot_checks_verdict" CHECK ("verdict" IN ('OK', 'VAGUE', 'WRONG', 'NO_ANSWER')), CONSTRAINT "PK_947f4b110132b3eee3ef39df1d1" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_spot_checks_student" ON "spot_checks" ("student_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "flags" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "student_id" uuid NOT NULL, "report_id" uuid, "kind" character varying(30) NOT NULL, "reason" text NOT NULL, "status" character varying(10) NOT NULL DEFAULT 'NEW', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "reviewed_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "chk_flags_status" CHECK ("status" IN ('NEW', 'REVIEWED', 'DISMISSED')), CONSTRAINT "chk_flags_kind" CHECK ("kind" IN ('STYLE_MISMATCH', 'TOO_POLISHED', 'PCT_JUMP', 'GENERIC_RETELLING', 'REPEATED_RETELLING', 'FORWARDED', 'SPOT_CHECK_FAILED', 'NORM_MISSED_3_WEEKS')), CONSTRAINT "PK_ea7e333c92a55de9e9b8d0b9afd" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "idx_flags_student" ON "flags" ("student_id") `);
    await queryRunner.query(
      `CREATE INDEX "idx_flags_status_created" ON "flags" ("status", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "card_attempts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "student_id" uuid NOT NULL, "word_id" uuid NOT NULL, "stage" smallint NOT NULL, "prompt" jsonb NOT NULL, "answer" text, "is_correct" boolean, "skipped" boolean NOT NULL DEFAULT false, "feedback" text, "channel" character varying(10) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "answered_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "chk_card_attempts_channel" CHECK ("channel" IN ('BOT', 'MINI_APP')), CONSTRAINT "chk_card_attempts_stage" CHECK ("stage" IN (1, 2, 3)), CONSTRAINT "PK_e46c869912788f666a582ffc1ce" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_card_attempts_student_created" ON "card_attempts" ("student_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "ai_usage" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "student_id" uuid, "purpose" character varying(20) NOT NULL, "model" character varying(64) NOT NULL, "input_tokens" integer NOT NULL DEFAULT '0', "cache_read_tokens" integer NOT NULL DEFAULT '0', "cache_write_tokens" integer NOT NULL DEFAULT '0', "output_tokens" integer NOT NULL DEFAULT '0', "cost_usd" numeric(10,6) NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "chk_ai_usage_purpose" CHECK ("purpose" IN ('DIALOG', 'AUTHENTICITY', 'SENTENCE_CHECK', 'ENRICH_WORDS', 'PARENT_REPORT')), CONSTRAINT "PK_3dddab3a15520a9c3eba859195d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_ai_usage_student_created" ON "ai_usage" ("student_id", "created_at") `,
    );
    await queryRunner.query(`CREATE INDEX "idx_ai_usage_created" ON "ai_usage" ("created_at") `);
    await queryRunner.query(
      `CREATE TABLE "ai_messages" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "student_id" uuid NOT NULL, "role" character varying(10) NOT NULL, "content" jsonb NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "chk_ai_messages_role" CHECK ("role" IN ('user', 'assistant')), CONSTRAINT "PK_a390434d4a515ba18a41bc996c2" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_ai_messages_student_created" ON "ai_messages" ("student_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "admins" ("telegram_user_id" bigint NOT NULL, "role" character varying(10) NOT NULL, "name" character varying, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "chk_admins_role" CHECK ("role" IN ('OWNER', 'TEACHER')), CONSTRAINT "PK_50517e41a308e14c1ca3b428f6e" PRIMARY KEY ("telegram_user_id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "word_imports" ADD CONSTRAINT "FK_a584a80c6dce15fbfd616f0d23e" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "word_imports" ADD CONSTRAINT "FK_ce00212b25cd6a98e68b1cd495e" FOREIGN KEY ("group_chat_id") REFERENCES "groups"("chat_id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "reports" ADD CONSTRAINT "FK_8b216cb73d9fbf2948c9e7d58fd" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "words" ADD CONSTRAINT "FK_a6210a38aec5e7a974e9fbad55b" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "words" ADD CONSTRAINT "FK_237bcb115adb231a070ae784dca" FOREIGN KEY ("source_report_id") REFERENCES "reports"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "student_groups" ADD CONSTRAINT "FK_26f5abac21d5008e18949f7e1af" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "student_groups" ADD CONSTRAINT "FK_53632d59ac01551d21a084ffe96" FOREIGN KEY ("group_chat_id") REFERENCES "groups"("chat_id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "reminder_log" ADD CONSTRAINT "FK_b534e61efd3ea42b8f34da18af5" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "spot_checks" ADD CONSTRAINT "FK_d5be49e539fc48c1d82b292eee2" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "spot_checks" ADD CONSTRAINT "FK_96438c1864eedfe74ded2871583" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "flags" ADD CONSTRAINT "FK_d647acbb2bc611e7f1a22f90e82" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "flags" ADD CONSTRAINT "FK_4444d27f9c4ba31ddbc8af75237" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "card_attempts" ADD CONSTRAINT "FK_33ffeb026c5a8151f703f690b40" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "card_attempts" ADD CONSTRAINT "FK_26578686873fc36af91f673fdcb" FOREIGN KEY ("word_id") REFERENCES "words"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "ai_usage" ADD CONSTRAINT "FK_b9cb1653c07f5f70a1ce9a9848c" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "ai_messages" ADD CONSTRAINT "FK_bf406be7f434f7868fde5327373" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    // Hand-written: TypeORM cannot express functional indexes (declared on the entity with synchronize: false).
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_words_student_word" ON "words" ("student_id", lower("word"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."uq_words_student_word"`);
    await queryRunner.query(
      `ALTER TABLE "ai_messages" DROP CONSTRAINT "FK_bf406be7f434f7868fde5327373"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ai_usage" DROP CONSTRAINT "FK_b9cb1653c07f5f70a1ce9a9848c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "card_attempts" DROP CONSTRAINT "FK_26578686873fc36af91f673fdcb"`,
    );
    await queryRunner.query(
      `ALTER TABLE "card_attempts" DROP CONSTRAINT "FK_33ffeb026c5a8151f703f690b40"`,
    );
    await queryRunner.query(`ALTER TABLE "flags" DROP CONSTRAINT "FK_4444d27f9c4ba31ddbc8af75237"`);
    await queryRunner.query(`ALTER TABLE "flags" DROP CONSTRAINT "FK_d647acbb2bc611e7f1a22f90e82"`);
    await queryRunner.query(
      `ALTER TABLE "spot_checks" DROP CONSTRAINT "FK_96438c1864eedfe74ded2871583"`,
    );
    await queryRunner.query(
      `ALTER TABLE "spot_checks" DROP CONSTRAINT "FK_d5be49e539fc48c1d82b292eee2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reminder_log" DROP CONSTRAINT "FK_b534e61efd3ea42b8f34da18af5"`,
    );
    await queryRunner.query(
      `ALTER TABLE "student_groups" DROP CONSTRAINT "FK_53632d59ac01551d21a084ffe96"`,
    );
    await queryRunner.query(
      `ALTER TABLE "student_groups" DROP CONSTRAINT "FK_26f5abac21d5008e18949f7e1af"`,
    );
    await queryRunner.query(`ALTER TABLE "words" DROP CONSTRAINT "FK_237bcb115adb231a070ae784dca"`);
    await queryRunner.query(`ALTER TABLE "words" DROP CONSTRAINT "FK_a6210a38aec5e7a974e9fbad55b"`);
    await queryRunner.query(
      `ALTER TABLE "reports" DROP CONSTRAINT "FK_8b216cb73d9fbf2948c9e7d58fd"`,
    );
    await queryRunner.query(
      `ALTER TABLE "word_imports" DROP CONSTRAINT "FK_ce00212b25cd6a98e68b1cd495e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "word_imports" DROP CONSTRAINT "FK_a584a80c6dce15fbfd616f0d23e"`,
    );
    await queryRunner.query(`DROP TABLE "admins"`);
    await queryRunner.query(`DROP INDEX "public"."idx_ai_messages_student_created"`);
    await queryRunner.query(`DROP TABLE "ai_messages"`);
    await queryRunner.query(`DROP INDEX "public"."idx_ai_usage_created"`);
    await queryRunner.query(`DROP INDEX "public"."idx_ai_usage_student_created"`);
    await queryRunner.query(`DROP TABLE "ai_usage"`);
    await queryRunner.query(`DROP INDEX "public"."idx_card_attempts_student_created"`);
    await queryRunner.query(`DROP TABLE "card_attempts"`);
    await queryRunner.query(`DROP INDEX "public"."idx_flags_status_created"`);
    await queryRunner.query(`DROP INDEX "public"."idx_flags_student"`);
    await queryRunner.query(`DROP TABLE "flags"`);
    await queryRunner.query(`DROP INDEX "public"."idx_spot_checks_student"`);
    await queryRunner.query(`DROP TABLE "spot_checks"`);
    await queryRunner.query(`DROP TABLE "membership_checks"`);
    await queryRunner.query(`DROP INDEX "public"."uq_reminder_log"`);
    await queryRunner.query(`DROP TABLE "reminder_log"`);
    await queryRunner.query(`DROP INDEX "public"."idx_student_groups_group"`);
    await queryRunner.query(`DROP TABLE "student_groups"`);
    await queryRunner.query(`DROP TABLE "settings"`);
    await queryRunner.query(`DROP TABLE "word_lexicon"`);
    await queryRunner.query(`DROP INDEX "public"."idx_words_student_due"`);
    await queryRunner.query(`DROP TABLE "words"`);
    await queryRunner.query(`DROP INDEX "public"."idx_reports_student_week"`);
    await queryRunner.query(`DROP TABLE "reports"`);
    await queryRunner.query(`DROP TABLE "word_imports"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_89d97b30d7d2b126c22e4fb28d"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_7e3cc69289c6289805172b624a"`);
    await queryRunner.query(`DROP TABLE "students"`);
    await queryRunner.query(`DROP TABLE "groups"`);
  }
}
