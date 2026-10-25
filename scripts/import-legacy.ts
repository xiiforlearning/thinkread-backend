/**
 * Migration from the old bot: load the two JSON results of scripts/legacy-export.sql into
 * ThinkRead — active groups (level stays unset, the owner picks it in the dashboard), their
 * students as PENDING_NAME with the old name split into first / last as a prefill, and the
 * student ↔ group links. The owner (ADMIN_TELEGRAM_ID) and the teachers are skipped. Re-runnable.
 *
 *   pnpm ops:import-legacy legacy.json          # { "groups": [...], "students": [...] }
 *   pnpm ops:import-legacy < legacy.json        # or on stdin (paste a heredoc in the shell)
 *   pnpm ops:import-legacy --dry-run legacy.json
 *
 * Needs the database (same env as the app) and ADMIN_TELEGRAM_ID.
 */
import 'reflect-metadata';
import { readFileSync } from 'fs';
import dataSource from '../ormconfig';

interface LegacyGroup {
  chat_id: number;
  title: string;
  teachers?: number[];
}
interface LegacyStudent {
  tg: number;
  chat_id: number;
  name: string | null;
  username?: string | null;
  dm_blocked?: boolean;
  registered_at?: string | null;
}
interface LegacyDump {
  groups: LegacyGroup[];
  students: LegacyStudent[];
}

/** A word that can be a real name part: letters only (any alphabet), 2+ characters. Nicknames, emoji, "K." stay out. */
const NAME_PART = /^\p{L}[\p{L}'’-]+$/u;

/**
 * The old bot stored the Telegram display name, often a nickname or emoji. Only parts that look
 * like a name are prefilled; the Mini App asks for the rest.
 */
function splitName(full: string | null): { first: string | null; last: string | null } {
  const parts = (full ?? '').trim().split(/\s+/).filter(Boolean);
  const first = parts[0] && NAME_PART.test(parts[0]) ? parts[0] : null;
  const rest = parts.slice(1);
  const last =
    first && rest.length > 0 && rest.every((w) => NAME_PART.test(w)) ? rest.join(' ') : null;
  return { first, last };
}

function readDump(): LegacyDump {
  const file = process.argv.slice(2).find((a) => !a.startsWith('--'));
  const raw = file ? readFileSync(file, 'utf8') : readFileSync(0, 'utf8');
  const parsed = JSON.parse(raw) as Partial<LegacyDump>;
  if (!Array.isArray(parsed.groups) || !Array.isArray(parsed.students))
    throw new Error('expected { "groups": [...], "students": [...] }');
  return { groups: parsed.groups, students: parsed.students };
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const owner = Number(process.env.ADMIN_TELEGRAM_ID ?? 0);
  const dump = readDump();
  const activeChats = new Set(dump.groups.map((g) => Number(g.chat_id)));
  const staff = new Set<number>([owner, ...dump.groups.flatMap((g) => g.teachers ?? [])]);
  const students = dump.students.filter(
    (s) => activeChats.has(Number(s.chat_id)) && !staff.has(Number(s.tg)),
  );
  const skipped = dump.students.length - students.length;
  console.log(
    `${dump.groups.length} group(s), ${students.length} student(s) to import, ${skipped} skipped (staff or inactive group)${dryRun ? ' — dry run' : ''}`,
  );
  if (dryRun) {
    for (const g of dump.groups) console.log(`  group ${g.chat_id} "${g.title}"`);
    for (const s of students) {
      const { first, last } = splitName(s.name);
      console.log(`  student ${s.tg} → ${s.chat_id}: ${first ?? '—'} ${last ?? ''}`.trimEnd());
    }
    return;
  }

  const ds = await dataSource.initialize();
  const qr = ds.createQueryRunner();
  await qr.connect();
  await qr.startTransaction();
  try {
    for (const g of dump.groups) {
      await qr.query(
        `INSERT INTO groups (chat_id, title, level, is_active, teacher_telegram_ids, teachers_refreshed_at)
         VALUES ($1, $2, NULL, TRUE, $3::jsonb, now())
         ON CONFLICT (chat_id) DO UPDATE
           SET title = EXCLUDED.title, is_active = TRUE, teacher_telegram_ids = EXCLUDED.teacher_telegram_ids`,
        [Number(g.chat_id), g.title, JSON.stringify((g.teachers ?? []).map(Number))],
      );
    }
    let created = 0;
    for (const s of students) {
      const { first, last } = splitName(s.name);
      const rows = (await qr.query(
        `INSERT INTO students (telegram_user_id, username, first_name, last_name, kind, status, language, dm_blocked, registered_at)
         VALUES ($1, $2, $3, $4, 'STUDENT', 'PENDING_NAME', 'en', $5, coalesce($6::timestamptz, now()))
         ON CONFLICT (telegram_user_id) DO UPDATE SET username = EXCLUDED.username
         RETURNING id, (xmax = 0) AS inserted`,
        [Number(s.tg), s.username ?? null, first, last, !!s.dm_blocked, s.registered_at ?? null],
      )) as { id: string; inserted: boolean }[];
      if (rows[0]?.inserted) created += 1;
      await qr.query(
        `INSERT INTO student_groups (student_id, group_chat_id, is_member)
         VALUES ($1, $2, TRUE) ON CONFLICT DO NOTHING`,
        [rows[0].id, Number(s.chat_id)],
      );
    }
    await qr.commitTransaction();
    console.log(
      `done: ${dump.groups.length} group(s) upserted, ${created} student(s) created, ${students.length - created} already existed`,
    );
  } catch (err) {
    await qr.rollbackTransaction();
    throw err;
  } finally {
    await qr.release();
    await ds.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
