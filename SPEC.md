# English Reading Bot — Telegram bot for tracking daily reading and vocabulary

You are building a Telegram bot from scratch. Read this entire spec before writing any code. Build it iteratively in the order specified in the "Build order" section. After each stage, stop and ask me to verify before moving on.

## Product summary

A Telegram bot that helps a single English teacher (the admin) track daily reading homework for students across multiple isolated groups.

- Admin adds the bot to a Telegram group (one group = one class)
- Students click a deep-link to register in DM with the bot, specify the book they're reading and total pages
- Every morning at 08:00, the bot reminds each student to read 10–15 pages and sends due Anki-style flashcards in DM
- Every evening at 20:00, the bot asks each student in DM for new words learned and current page
- After midnight, the bot finalizes the day's report; at 08:30 it sends the previous day's report to the admin
- If a student fails to make progress (no words AND no page update) for 3 consecutive days, the bot posts in the group: "@username got 3 missed days — assigned a presentation for next class"
- Flashcards use a simplified SM-2 spaced repetition (1 → 3 → days * ease, ease starts at 2.5)

## MVP constraints (do not implement anything outside these)

- One admin total (Telegram user ID from `.env`)
- One student belongs to exactly one group
- One global timezone: `Asia/Tashkent` (configurable in `.env` but not per-group in MVP)
- Long polling, not webhooks
- Russian UI for all bot messages; English words are data, not UI
- No web admin panel — admin uses Telegram commands only

## Tech stack (use exactly these)

- **NestJS** + **TypeScript** (strict mode)
- **nestjs-telegraf** for Telegram integration
- **PostgreSQL** + **TypeORM** with migrations (not `synchronize: true`)
- **@nestjs/schedule** for cron jobs
- **docker-compose** for local dev: services `bot`, `postgres`, `adminer`
- `class-validator` + `class-transformer` for DTOs where applicable
- Node 20+, pnpm preferred (npm OK if pnpm unavailable)

## Database schema

### `groups`
- `chatId` bigint PK (Telegram chat ID, negative for groups)
- `title` varchar
- `isActive` boolean default true
- `morningTime` time default '08:00'
- `eveningTime` time default '20:00'
- `createdAt`, `updatedAt`

### `students`
- `id` uuid PK
- `telegramUserId` bigint, unique
- `chatId` bigint, FK → groups.chatId
- `fullName` varchar
- `username` varchar nullable
- `bookTitle` varchar nullable
- `bookTotalPages` int nullable
- `bookStartPage` int default 1
- `currentPage` int nullable
- `state` enum: `IDLE` | `AWAITING_BOOK_TITLE` | `AWAITING_BOOK_TOTAL_PAGES` | `AWAITING_BOOK_START_PAGE` | `AWAITING_EVENING_WORDS` | `AWAITING_EVENING_PAGE`
- `registeredAt`, `updatedAt`

### `words`
- `id` uuid PK
- `studentId` uuid FK → students.id, cascade delete
- `word` text
- `translation` text
- `addedAt` timestamptz
- `intervalDays` int default 1
- `nextReviewAt` timestamptz
- `reviewCount` int default 0
- `lapses` int default 0
- `ease` real default 2.5
- Index on `(studentId, nextReviewAt)`

### `daily_reports`
- `id` uuid PK
- `studentId` uuid FK → students.id, cascade delete
- `date` date
- `wordsCount` int default 0
- `pageReached` int nullable
- `pagesReadToday` int nullable (computed as pageReached − previous day's pageReached)
- `submittedWords` boolean default false
- `submittedPage` boolean default false
- `countsAsActive` boolean — true if `submittedWords` OR `submittedPage` is true
- UNIQUE(`studentId`, `date`)

### `presentations`
- `id` uuid PK
- `studentId` uuid FK → students.id
- `assignedAt` timestamptz
- `topic` text nullable
- `done` boolean default false

Use TypeORM migrations from day one. Do not enable `synchronize`.

## Bot behavior

### When admin adds the bot to a group
- Listen for `my_chat_member` update where the new status is `member` or `administrator`
- Verify the user who added the bot is `ADMIN_TELEGRAM_ID`. If not, post a brief refusal message and leave the chat
- Insert/upsert a row in `groups`
- Post a welcome message in the group with a deep-link: `t.me/<bot_username>?start=group_<chatId>`

### When student clicks the deep link
- `/start group_<chatId>` in DM
- Look up the group; reject if inactive or missing
- Create the student row with `state = AWAITING_BOOK_TITLE`
- Ask: "Какую книгу ты читаешь? Напиши автора и название."
- Next message → save as `bookTitle`, state → `AWAITING_BOOK_TOTAL_PAGES`, ask total pages
- Next message → parse int, save, state → `AWAITING_BOOK_START_PAGE`, ask start page (offer skip → defaults to 1)
- Next message → save `bookStartPage` and set `currentPage = bookStartPage`, state → `IDLE`
- Send confirmation summary

If the student is already registered and clicks the link again, treat it as `/book` (re-register the book without losing words).

### Evening flow (20:00 cron)
- For each student in `IDLE` state in any active group:
  - Set `state = AWAITING_EVENING_WORDS`
  - DM: "Какие новые слова ты сегодня узнал? Отправь списком, по одному в строке, в формате: слово — перевод"
- Student sends a message:
  - Parse word/translation pairs (see Parser section)
  - If 0 pairs parsed → ask to retry, stay in same state
  - Otherwise insert into `words` (default `nextReviewAt = now + 1 day`, `intervalDays = 1`)
  - Upsert today's `daily_reports` row with `submittedWords = true`, `wordsCount = N`
  - state → `AWAITING_EVENING_PAGE`, ask "На какой странице остановился?"
- Student sends a number:
  - Validate it's between `currentPage` (or `bookStartPage`) and `bookTotalPages`
  - Update `students.currentPage`
  - Upsert today's `daily_reports` with `submittedPage = true`, `pageReached = N`, `pagesReadToday = N − previousPage`
  - state → `IDLE`, confirmation message
  - If `currentPage >= bookTotalPages`, congratulate and offer `/book` to start a new one

A student can also use `/words` or `/page N` at any time outside the evening flow — same effect on `daily_reports`.

### 23:00 cron — second reminder
- For each student whose today's `daily_reports.countsAsActive` is still false, DM a gentle reminder

### 00:05 cron — finalize day
- For every active student without a `daily_reports` row for yesterday, create one with all-false flags
- Set `state = IDLE` for any student stuck in `AWAITING_EVENING_*`
- Compute streaks: if a student has 3 consecutive days where `countsAsActive = false` (including yesterday):
  - Insert a `presentations` row
  - Post in the student's group: "@username пропустил 3 дня — готовит презентацию на следующее занятие"
  - Use `username` if available, otherwise mention by full name (no `tg://user?id=` ping — group chat may not allow it; use plain @username and fall back to name)

### 08:00 cron — morning
- For each student:
  - DM: "Доброе утро! Сегодня читаем 10–15 страниц книги «<title>», ты на странице <currentPage> из <total>."
  - Query words where `nextReviewAt <= now()`, limit 20
  - If any: DM "У тебя N слов на повторение, поехали" and send the first card. Cards are sent one at a time with inline keyboard "Показать перевод" → reveals translation with two buttons "Знал" / "Не знал" → updates SR state → sends next card
  - If a student wants more, `/review` triggers the same logic on demand

### 08:30 cron — admin report
- Build report for yesterday across all active groups (see Report format section)
- Send to `ADMIN_TELEGRAM_ID` in DM
- Split into multiple messages if over 4000 chars; split on newlines

### Spaced repetition (SM-2 simplified)
On "Знал":
- if `reviewCount == 0` → `intervalDays = 1`
- elif `reviewCount == 1` → `intervalDays = 3`
- else → `intervalDays = round(intervalDays * ease)`
- `ease = min(2.7, ease + 0.05)`

On "Не знал":
- `intervalDays = 1`
- `ease = max(1.3, ease - 0.2)`
- `lapses += 1`

Always: `reviewCount += 1`, `nextReviewAt = now + intervalDays days`.

### Word parser

Input is a multi-line message. Each non-empty line should match one of these patterns (try in order):
1. `^(.+?)\s*[—–]\s*(.+)$` — em-dash or en-dash, spaces optional
2. `^(.+?)\s+-\s+(.+)$` — hyphen, requires surrounding spaces (so "in-laws — мама" parses correctly)
3. `^(.+?)\s*:\s+(.+)$` — colon

Trim leading bullets/numbers `• - – — * 0-9 . )` before matching. Skip lines that don't match. Return `{word, translation}[]`.

### Admin commands
- `/report` — generate and send yesterday's report immediately (works in DM or in any group; in group, scoped to that group)
- `/settings` — show current group config (must be used in a group)
- `/set_morning HH:MM`, `/set_evening HH:MM` — update timings for the group it's used in
- `/link` — return the deep-link for the current group
- `/students` — list registered students in the current group with their book and current page
- `/skip_presentation <studentId>` — mark a presentation as done

All admin commands silently no-op for non-admin users.

### Student commands
- `/start` — registration entry point
- `/words` — manually trigger word submission flow
- `/page <N>` — update current page directly
- `/book` — re-enter book details
- `/review` — get a flashcard block on demand
- `/mystatus` — show their book, page, total words
- `/help`

### Report format

```
📊 Отчёт за 17.05.2026

═══ «Group title 1» ═══

👤 John Doe — «James Hadley Chase — Strictly for Cash» (стр. 47 → 62, +15 стр., 21 слово)
jerking his thumb — дёргая большим пальцем
gaudy — броский, вульгарный
...

👤 Jane Smith — ❌ не сдала ничего (2-й день подряд)

═══ «Group title 2» ═══

⚠️ Mike Brown — 3-й день молчит, назначена презентация
...
```

Show the "X-й день подряд" counter only if it's ≥ 2.

## Project structure

```
src/
  main.ts
  app.module.ts
  config/
    config.module.ts
    config.service.ts
  database/
    database.module.ts
    migrations/
  bot/
    bot.module.ts
    bot.update.ts                 — root @Update class, /start, /help, /my_chat_member
    handlers/
      registration.handler.ts
      evening.handler.ts
      flashcard.handler.ts
      admin.handler.ts
      student.handler.ts
    middleware/
      admin-only.guard.ts
      state-router.middleware.ts  — routes plain text messages based on student.state
    utils/
      word-parser.ts
      deep-link.ts
  groups/
    groups.module.ts
    groups.service.ts
    group.entity.ts
  students/
    students.module.ts
    students.service.ts
    student.entity.ts
    student-state.enum.ts
  words/
    words.module.ts
    words.service.ts
    word.entity.ts
    sm2.ts
  reports/
    reports.module.ts
    reports.service.ts
    daily-report.entity.ts
    report-formatter.ts
  presentations/
    presentations.module.ts
    presentations.service.ts
    presentation.entity.ts
  scheduler/
    scheduler.module.ts
    scheduler.service.ts          — all @Cron definitions
  common/
    logger.ts
    types.ts
docker-compose.yml
Dockerfile
.env.example
README.md
package.json
tsconfig.json
nest-cli.json
ormconfig.ts                       — for TypeORM CLI migrations
```

## `.env` template

```
BOT_TOKEN=
ADMIN_TELEGRAM_ID=
TZ=Asia/Tashkent
DATABASE_HOST=postgres
DATABASE_PORT=5432
DATABASE_USER=bot
DATABASE_PASSWORD=bot
DATABASE_NAME=englishbot
NODE_ENV=development
```

## docker-compose requirements

- `bot`: builds from Dockerfile, depends on postgres healthcheck, mounts source for dev hot reload (optional), reads `.env`
- `postgres`: official `postgres:16-alpine`, named volume, healthcheck on `pg_isready`
- `adminer`: on port 8080

Bot must wait for Postgres to be healthy before starting. Migrations run automatically on container start (a `migration:run` step before `start:prod`, or a startup script).

## Build order — DO NOT SKIP, STOP AT EACH CHECKPOINT

For each stage, when done, summarize what you built and explicitly ask me to verify before moving to the next stage.

**Stage 1 — Skeleton**
- Nest project initialized
- TypeORM connection to Postgres works
- docker-compose runs cleanly (`docker compose up` produces a running but empty bot)
- One placeholder migration applied
- `/start` in DM replies "Hi, I'm alive"
- README has clear setup steps
- ⏸ STOP and report.

**Stage 2 — Group registration**
- `my_chat_member` handler, admin check, group row created
- Welcome message with deep-link posted in group
- `/link`, `/settings`, `/students` (stub) admin commands
- ⏸ STOP and report.

**Stage 3 — Student registration**
- Deep-link `/start group_<id>` flow
- State machine for book title → total pages → start page
- Validation (total pages > 0, start page ≤ total)
- `/book`, `/mystatus` commands
- ⏸ STOP and report.

**Stage 4 — Evening flow + word parser**
- `/words` command + parser
- Words saved with default SR state
- Page submission flow
- `/page` command
- `daily_reports` upsert on submission
- ⏸ STOP and report.

**Stage 5 — Scheduler + finalization**
- All cron jobs registered with `@Cron`
- 20:00 evening prompt
- 23:00 reminder
- 00:05 finalize + streak detection
- Streak → `presentations` insert + group post
- ⏸ STOP and report.

**Stage 6 — Morning + flashcards**
- 08:00 reading reminder
- Flashcard block with inline keyboard
- `/review` command
- SM-2 update on each answer
- ⏸ STOP and report.

**Stage 7 — Admin report**
- 08:30 cron generates and DMs report
- `/report` on-demand command
- Long message splitting
- Streak counter in report
- ⏸ STOP and report.

**Stage 8 — Polish**
- `/skip_presentation`, `/set_morning`, `/set_evening`
- Edge cases: book completion, student re-registration, bot kicked from group (deactivate group, stop sending to its students)
- Error handling: failed DMs (student blocked bot) shouldn't crash the cron
- Log structured events at info level for every scheduled action
- ⏸ STOP and report.

## Engineering rules

- **Strict TypeScript.** No `any` without a comment justifying it. Avoid `as` casts.
- **No `synchronize: true`.** All schema changes go through migrations from day one.
- **Idempotent crons.** Running a cron twice for the same day must not duplicate `daily_reports` rows or double-post in groups.
- **No silent failures.** Wrap each per-student operation in try/catch; log failures with student ID and continue with the next student. Failed Telegram sends (e.g. user blocked bot) are warnings, not errors.
- **Test the parser.** Write unit tests for `word-parser.ts` covering em-dash, en-dash, hyphen, colon, lines with bullets, "in-laws" edge case, empty input, lines with no separator.
- **Test SM-2.** Unit tests for the interval/ease transitions.
- **Don't over-engineer.** No event bus, no CQRS, no microservices. Plain services and repositories.
- **Russian text in code.** All user-facing strings in Russian; put them in a single `messages.ts` constants file per module so I can edit copy without hunting through handlers.
- **Time handling.** Store all timestamps in UTC. Convert to `Asia/Tashkent` only when displaying or computing "today" for `daily_reports`. Use `date-fns-tz` or equivalent — do not roll your own timezone math.

## What NOT to build

- Webhooks (polling only)
- Multiple admins
- Per-group timezone (one global TZ for MVP)
- A student belonging to multiple groups
- Web admin panel
- CSV / Anki deck export
- Weekly/monthly statistics
- Internationalization

## When unsure

Ask me. Specifically ask when:
- A schema decision could be done two reasonable ways
- A Telegram API limitation forces a UX compromise
- A library choice has tradeoffs (e.g., `node-pg-migrate` vs TypeORM migrations — use TypeORM)
- You'd be adding a dependency not mentioned in this spec

Do not silently change the spec. If you think something here is wrong, flag it and propose the change before implementing.

Start with Stage 1.