# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project overview

**ThinkRead** — AI Telegram bot for an English school: students send free-text reports on
reading and listening, keep a personal vocabulary and practise it with 3-stage cards; the AI
understands intent and calls tools (no slash commands). On top of the bot: a Telegram Mini App
(student + admin views) and a web dashboard for the school owner, both backed by the REST API in
this repo.

The product spec lives in Notion (workspace **ThinkRead → 📜 Документация**). Read
"Поверхностное ТЗ" for the data model and error codes, "AI-агент и инструменты" for the AI layer,
"План разработки" for the build order. Keep Notion and code in sync when a decision changes.

**Current stage:** stage 2 done — group level via inline keyboard (owner only), registration
gated by `getChatMember`, real name, monthly membership check with archive/restore and an owner
summary. Next: stage 3 (AI core: Claude + tools).

### Ports (domain ↔ Telegram)

Domain services never import telegraf. They depend on small interfaces —
`MEMBERSHIP_PORT` (`getMemberStatus`) and `NOTIFIER_PORT` (`sendToUser`) — implemented in
`infra/bot/ports/` and provided by the global `TelegramPortsModule`. Tests use fakes.

`BOT_LAUNCH=false` boots everything without polling (handlers registered, no `bot.launch()`).

## Architecture

NestJS monolith with three layers:

```
src/
├── main.ts / app.module.ts
├── config/                  — env accessors (AppConfigService) + globalConfig (domain defaults)
├── common/                  — codes (ServiceCode, ErrorCode, ErrorLevel), AppError, db-checks, logger
├── domain/                  — business entities and services; must NOT import from infra/
│   ├── groups/              — Group, GroupLevel, listening methods
│   ├── students/            — Student, StudentGroup, statuses, DialogState
│   ├── reports/             — Report (reading / listening)
│   ├── words/               — Word, WordLexicon (shared enrichment cache), WordImport
│   ├── cards/               — CardAttempt
│   ├── flags/               — Flag, SpotCheck
│   ├── norms/               — week helpers, ReminderLog
│   ├── ai-log/              — AiMessage (dialog history), AiUsage (cost)
│   ├── membership/          — MembershipCheck
│   ├── admins/, settings/
└── infra/                   — adapters; depend on domain/, never the reverse
    ├── db/                  — TypeORM module + migrations
    ├── bot/                 — Telegram gateway (telegraf)
    └── teacher/             — teacher detection via group admin custom title
```

Planned infra modules: `ai/` (Claude + tools), `api/` (REST for Mini App / dashboard),
`scheduler/` (reminders, weekly summary, monthly membership check).

### Rules

- `domain/` never imports `infra/`. Business logic lives in domain services; the AI tools, REST
  controllers and crons all call the same service methods.
- Errors: throw `AppError({ level, service, error })`. Code format `{level}{service}{error}`,
  e.g. `303255` = level 3, STUDENTS, NOT_A_GROUP_MEMBER. Register new domains in
  `service-codes.ts`, new errors in `error-codes.ts`.
- Enum-like varchar columns get a `@Check(name, enumCheck(column, Enum))` on the entity so the DB
  enforces the value set and `migration:generate` stays clean.
- jsonb defaults are written as `default: () => "'[]'"` (no `::jsonb` cast) — otherwise TypeORM
  reports schema drift.
- Timestamps in UTC; "today" / "this week" via `domain/norms/week.ts` in `Asia/Tashkent`.
- No physical deletion of students, words or reports — status changes only.
- User-facing text is Russian and lives in `messages.ts` per module. Never log message text
  (students' reports are personal data).
- Strict TypeScript, no `any` without a justifying comment. Conventional Commits.

## Commands

| Command | Purpose |
|---|---|
| `pnpm start:dev` | Run with hot reload |
| `pnpm build` | Compile (strict) |
| `pnpm lint` / `pnpm lint:check` | ESLint + Prettier (fix / check) |
| `pnpm test` | Jest |
| `pnpm migration:run` / `migration:revert` / `migration:show` | TypeORM migrations |
| `pnpm typeorm migration:generate src/infra/db/migrations/<Name>` | Generate a migration from entity changes |

Never use `synchronize: true`. CI runs lint, build, tests, applies/reverts/re-applies migrations and
fails on schema drift between entities and migrations.

### Migrations

- One baseline migration (`*-Baseline.ts`) creates the whole schema. Later changes are new
  migrations generated from entities.
- Things TypeORM cannot express (the `uuid-ossp` extension, the functional unique index
  `uq_words_student_word` on `(student_id, lower(word))`) are hand-written in the migration; the
  index is declared on the entity with `synchronize: false`.

### Local setup

```bash
cp .env.example .env   # fill BOT_TOKEN, ADMIN_TELEGRAM_ID
docker compose up --build   # postgres + bot + adminer (:8080)
# or without Docker: local Postgres, pnpm install, pnpm migration:run, pnpm start:dev
```
