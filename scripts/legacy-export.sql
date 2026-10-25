-- Migration from the old bot (repo english-bot): run these two queries on the OLD database and
-- send the two JSON results over. `pnpm ops:import-legacy` (scripts/import-legacy.ts) loads them
-- into ThinkRead. Only active groups and their students; words and reports stay behind.

-- 1. groups
SELECT json_agg(json_build_object(
  'chat_id', chat_id,
  'title', title,
  'teachers', coalesce(teacher_telegram_ids, '[]'::jsonb)
) ORDER BY title) AS groups
FROM groups
WHERE is_active;

-- 2. students of the active groups
SELECT json_agg(json_build_object(
  'tg', s.telegram_user_id,
  'chat_id', s.chat_id,
  'name', s.full_name,
  'username', s.username,
  'dm_blocked', s.dm_blocked,
  'registered_at', s.registered_at
) ORDER BY s.chat_id, s.full_name) AS students
FROM students s
JOIN groups g ON g.chat_id = s.chat_id
WHERE g.is_active;
