-- Migration from the old bot (repo english-bot) to ThinkRead: groups and their students only.
--
-- Run this against the OLD database. It prints one text block — ready SQL for the NEW database:
--
--   psql "$OLD_DATABASE_URL" -At -v owner_telegram_id=<ADMIN_TELEGRAM_ID> -f scripts/legacy-export.sql > legacy.sql
--   less legacy.sql                      # look through it
--   psql "$NEW_DATABASE_URL" -f legacy.sql
--
-- What it carries over:
--   groups          chat_id, title, teacher_telegram_ids (teachers are detected the same way in
--                   both bots: the admin custom title "teacher"); level stays NULL — the owner
--                   sets it in the dashboard (Groups), then runs «Check membership» so every
--                   student gets the level of their group.
--   students        telegram_user_id, username, dm_blocked, registered_at, the old full name
--                   split into first / last as a prefill; status PENDING_NAME, so the Mini App
--                   asks everyone for their real first and last name on the first visit.
--   student_groups  one row per student for their old group.
-- Not carried: words, reports, presentations, reading progress (customer decision 25.10.2026).
-- Only active groups and the students in them. The owner and the teachers are skipped — they
-- sign in to the dashboard, not as students: pass the owner as -v owner_telegram_id=<ADMIN_TELEGRAM_ID>.
-- Re-runnable: every statement is ON CONFLICT-safe.

\if :{?owner_telegram_id}
\else
  \set owner_telegram_id 0
\endif

SELECT
  E'BEGIN;\n\n-- groups\n'
  || coalesce((
    SELECT string_agg(
      format(
        'INSERT INTO groups (chat_id, title, level, is_active, teacher_telegram_ids, teachers_refreshed_at, created_at) '
        || 'VALUES (%s, %L, NULL, TRUE, %L::jsonb, %L, %L) '
        || 'ON CONFLICT (chat_id) DO UPDATE SET title = EXCLUDED.title, is_active = TRUE, '
        || 'teacher_telegram_ids = EXCLUDED.teacher_telegram_ids;',
        g.chat_id, g.title, coalesce(g.teacher_telegram_ids, '[]'::jsonb)::text,
        g.teachers_refreshed_at, g.created_at
      ),
      E'\n' ORDER BY g.title
    )
    FROM groups g
    WHERE g.is_active
  ), '-- (no active groups)')
  || E'\n\n-- students (PENDING_NAME: the Mini App asks for the real name) and their groups\n'
  || coalesce((
    SELECT string_agg(
      format(
        'WITH s AS (INSERT INTO students (telegram_user_id, username, first_name, last_name, kind, status, language, dm_blocked, registered_at) '
        || 'VALUES (%s, %L, %L, %L, ''STUDENT'', ''PENDING_NAME'', ''en'', %L, %L) '
        || 'ON CONFLICT (telegram_user_id) DO UPDATE SET username = EXCLUDED.username RETURNING id) '
        || 'INSERT INTO student_groups (student_id, group_chat_id, is_member) SELECT id, %s, TRUE FROM s ON CONFLICT DO NOTHING;',
        s.telegram_user_id,
        s.username,
        nullif(btrim(split_part(s.full_name, ' ', 1)), ''),
        CASE WHEN position(' ' IN s.full_name) > 0
             THEN nullif(btrim(substr(s.full_name, position(' ' IN s.full_name) + 1)), '')
             ELSE NULL END,
        s.dm_blocked,
        s.registered_at,
        s.chat_id
      ),
      E'\n' ORDER BY s.chat_id, s.full_name
    )
    FROM students s
    JOIN groups g ON g.chat_id = s.chat_id
    WHERE g.is_active
      AND s.telegram_user_id <> :owner_telegram_id
      AND s.telegram_user_id NOT IN (
        SELECT (jsonb_array_elements_text(coalesce(t.teacher_telegram_ids, '[]'::jsonb)))::bigint
        FROM groups t
      )
  ), '-- (no students)')
  || E'\n\nCOMMIT;\n' AS import_sql;
