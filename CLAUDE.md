# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

English Helper Bot is a Telegram bot for tracking daily reading and vocabulary in an English class. Read the full spec in [SPEC.md](SPEC.md); it defines the complete product behavior, database schema, and build order (8 stages).

**Current stage:** Stage 2 done (group registration via `my_chat_member`, admin commands).

## Architecture

The app is a **NestJS monolith** organised into three top-level layers: **`domain/`** (business entities & services), **`infra/`** (adapters: DB, Telegram), and cross-cutting `config/` + `common/`. This deviates from [SPEC.md:219-283](SPEC.md#L219-L283) — the spec proposed a flat layout, but we use a layered one per user direction.

### Top-level layout

```
src/
├── main.ts
├── app.module.ts
├── config/                 — env accessors + global constants
│   ├── config.module.ts
│   ├── config.service.ts
│   └── global.config.ts    — TS constants for domain values (reading, SM-2, schedule)
├── common/                 — cross-cutting: codes, errors, transformers, logger
│   ├── codes/              — ServiceCode, ErrorCode, ErrorLevel
│   ├── errors/             — AppError class with formatCode() → "{lvl}{svc}{err}"
│   ├── transformers.ts     — bigintToNumber, etc.
│   ├── logger.ts
│   └── index.ts            — barrel
├── domain/                 — business domains (entities, services, messages)
│   └── groups/             ✅ Stage 2
│       ├── group.entity.ts
│       ├── groups.service.ts
│       ├── groups.module.ts
│       └── messages.ts     — Russian copy specific to this domain
│   └── students/, words/, reports/, presentations/  ← Stages 3–7
└── infra/                  — infrastructure adapters
    ├── db/                 — TypeORM + migrations
    │   ├── db.module.ts
    │   └── migrations/
    └── bot/                — Telegram presentation layer
        ├── bot.module.ts
        ├── bot.update.ts   — global @Update: /start, my_chat_member
        ├── handlers/       — per-flow Telegram command handlers
        ├── services/       — bot-info.service.ts (caches getMe)
        ├── utils/          — deep-link.ts
        └── messages.ts     — only bot-core messages (alive)
```

### Layer rules

- **`domain/`** must not import from `infra/`. It can use `config/` and `common/`. Entities, services, repositories, and domain messages only.
- **`infra/`** depends on `domain/` (calls services), `config/`, and `common/`. Adapters for the outside world (Postgres, Telegram). No business logic here — just plumbing + translation.
- **`config/`** and **`common/`** are leaves; they don't import from `domain/` or `infra/`.
- **Russian messages** live in each domain's `messages.ts`. Truly bot-only strings (e.g. boot smoke text) go in `infra/bot/messages.ts`.

### Service codes & errors (cross-cutting)

- `ServiceCode` (2-digit per domain, [src/common/codes/service-codes.ts](src/common/codes/service-codes.ts)): `AUTH=01, GROUPS=02, STUDENTS=03, WORDS=04, REPORTS=05, PRESENTATIONS=06, SCHEDULER=07, BOT=08, PARSER=09, HEALTH=10`. Register new domains here.
- `ErrorCode` (3-digit): generic `000–005`, DB `100–104`, network `200–202`, business `250–254`, config `900s`, security `950s`.
- `ErrorLevel`: `1` (info) → `9` (system down). `HIGH_PRIORITY_LEVEL_MIN = 4` is the threshold above which (Stage 8) we'd notify the admin.
- `AppError.formatCode()` → 6-digit `{level}{service}{error}` (e.g. `203001` = level 2, service 03 STUDENTS, error 001 VALIDATION).

### Service codes

Each domain gets a 2-digit code in `src/common/codes/service-codes.ts` (`AUTH=01`, `GROUPS=02`, `STUDENTS=03`, `WORDS=04`, `REPORTS=05`, `PRESENTATIONS=06`, `SCHEDULER=07`, `BOT=08`, `PARSER=09`, `HEALTH=10`). When adding a new domain, register its code here.

### Error codes & levels

- `ErrorCode` (3-digit): generic 000–005 (UNKNOWN, VALIDATION, NOT_FOUND, UNAUTHORIZED, FORBIDDEN, BAD_REQUEST), DB 100–104, network 200–202, business 250–254 (ALREADY_EXISTS, INVALID_STATE, BOT_BLOCKED_BY_USER, OUT_OF_RANGE, PARSE_EMPTY), integration 300–301, configuration 900s, security 950s.
- `ErrorLevel`: 1 (info) → 9 (system down). Level ≥ 4 (`HIGH_PRIORITY_LEVEL_MIN`) is considered "high priority" — currently just logged via Nest; Stage 8 may route these to the admin's DM.
- Throw `new AppError({ level, service, error, message, meta })` from services. Catch at the handler boundary; log `err.code` + `err.message`; reply to the user with a friendly Russian message.

## Common tasks

### Setup

```bash
# Docker (recommended)
cp .env.example .env
# Edit .env: fill BOT_TOKEN and ADMIN_TELEGRAM_ID
docker compose up --build
# Bot logs show "Bot started, polling"
# Adminer: http://localhost:8080

# Local dev (without Docker)
pnpm install
cp .env.example .env  # point DATABASE_HOST to local Postgres
pnpm migration:run
pnpm start:dev
```

### Building and running

| Command | Purpose |
|---|---|
| `pnpm build` | Compile TypeScript to `dist/` (strict mode enforced) |
| `pnpm start:dev` | Run with hot reload (watches `src/`) |
| `pnpm start:prod` | Run compiled output |
| `pnpm lint` | ESLint + Prettier autofix |
| `pnpm test` | Jest (currently no tests; `--passWithNoTests` passes) |
| `pnpm test:watch` | Jest in watch mode |

### Database and migrations

| Command | Purpose |
|---|---|
| `pnpm migration:show` | List migration status (pending/applied) |
| `pnpm migration:run` | Apply pending migrations (runs on container startup automatically) |
| `pnpm migration:revert` | Revert the last applied migration |
| `pnpm migration:generate --name=AddFoo` | Generate a migration from entity changes (TypeORM introspection) |
| `pnpm migration:create --name=AddFoo` | Create an empty migration stub |

**Important:** Never use `synchronize: true`. All schema changes are explicit migrations via the CLI.

### TypeORM fundamentals

- **Entities**: Stored in `src/**/*.entity.ts` (auto-loaded). Each has a matching Repository injected via `InjectRepository(Entity)`.
- **Migrations**: Stored in `src/database/migrations/`. Format: `NnnnnnnnnnnnnnnName.ts` with `up()`/`down()` methods.
- **DataSource config**: Single source of truth is `ormconfig.ts` at repo root. Consumed by TypeORM CLI (via `pnpm typeorm`) and by `DatabaseModule` at runtime via `AppConfigService`.

## Key architectural decisions

1. **Domain modules**: Each business domain (`groups`, `students`, `words`, `reports`, `presentations`, `scheduler`) is a self-contained Nest module under `src/<domain>/` with its own entity, service, module, and `messages.ts`. The `bot/` module is the Telegram presentation layer that depends on these domains.
2. **Global config beats env vars for domain constants**: `.env` holds only secrets/infrastructure (token, DB credentials, TZ). Domain values (reading targets, SM-2 defaults, schedule fallbacks) live in `src/config/global.config.ts` as typed TS constants. Per-group overrides — when added — fall back to `globalConfig` field by field (the same `pagination`-style resolver pattern).
3. **Structured errors via `AppError`**: Every thrown error includes `level`, `service`, `error` codes. `AppError.formatCode()` yields a 6-digit code for logs and (optionally) user-facing diagnostics. Generic `Error` is reserved for unrecoverable bootstrap failures (missing env vars).
4. **Env vars are required by design**: `AppConfigService.require()` throws early at startup if a critical var is missing. Fails fast rather than silently using defaults.
5. **Migrations are mandatory**: `synchronize: false` means all schema changes go through git-tracked migrations. Non-negotiable per [SPEC.md:91](SPEC.md#L91).
6. **State machine via middleware**: Student registration and evening flows use a `student.state` enum. `state-router.middleware.ts` (Stage 3+) directs plain text messages by current state.
7. **Russian UI** ([SPEC.md:23](SPEC.md#L23)): All user-facing strings live in `messages.ts` per module — copy edits stay in one place.
8. **Timezone-aware time handling**: All timestamps stored in UTC. Convert to `Asia/Tashkent` (configurable via `TZ`) only when computing "today" for daily_reports or displaying times. Use `date-fns-tz`.
9. **Strict TypeScript** ([SPEC.md:372](SPEC.md#L372)): No `any` without a justifying comment.

## When adding new features (Stages 3–8)

1. **New business domain** → create `src/domain/<name>/` with `<name>.entity.ts`, `<name>.service.ts`, `<name>.module.ts`, `messages.ts`. Add to `AppModule` imports.
2. **New infra adapter** (e.g. cron scheduler in Stage 5, S3 upload, etc.) → create `src/infra/<name>/`. Adapters depend on `domain/`, never the reverse.
3. **Register a service code** in `src/common/codes/service-codes.ts`.
4. **Add domain constants** to `src/config/global.config.ts` (not `.env`) — anything you'd want to tune without redeploying secrets.
5. **Add a migration** under `src/infra/db/migrations/`: `pnpm migration:generate --name=Add<Feature>` or `pnpm migration:create --name=Add<Feature>`.
6. **Throw `AppError`** from domain services on business-rule violations: `new AppError({ level: ErrorLevel.LOW_VALIDATION, service: ServiceCode.STUDENTS, error: ErrorCode.OUT_OF_RANGE })`.
7. **Add bot handlers** under `src/infra/bot/handlers/<flow>.handler.ts`; catch `AppError` at the handler boundary and reply with the Russian copy from the relevant domain's `messages.ts`.
8. **Test parser and SM-2** ([SPEC.md:376-377](SPEC.md#L376-L377)): unit tests for `word-parser.ts` and spaced repetition logic are mandatory.

## Testing and validation

- **Strict TypeScript**: `pnpm build` will fail if there are type errors.
- **Migrations run automatically on container startup** via `docker-entrypoint.sh`. Idempotency is critical — running the same migration twice must be a no-op (handled by TypeORM's `migrations` table).
- **Integration test approach**: Per [SPEC.md:375](SPEC.md#L375), wrap per-student cron operations in try/catch, log failures with student ID, and continue with the next student. Failed Telegram sends are warnings, not errors.
- **No silent failures**: Always log what happened, especially in crons and bulk operations.

## Important constraints

- **Polling only**, no webhooks ([SPEC.md:22](SPEC.md#L22)): `nestjs-telegraf` handles this via the `telegraf` library.
- **One admin, one timezone, one student per group** ([SPEC.md:19-21](SPEC.md#L19-L21)).
- **No `synchronize: true`** — all schema is migrations.
- **Idempotent crons**: Running a cron twice for the same day must not duplicate rows or double-post ([SPEC.md:374](SPEC.md#L374)).

## Reference: Build order

See [SPEC.md:307-368](SPEC.md#L307-L368) for all 8 stages. Current: **Stage 2 done**.

- **Stage 2**: Group registration (`my_chat_member`, deep-link welcome)
- **Stage 3**: Student registration (state machine, book details)
- **Stage 4**: Evening flow + word parser + daily reports
- **Stage 5**: Cron jobs (20:00, 23:00, 00:05) + streak detection
- **Stage 6**: Morning cron + flashcards + SM-2 spaced repetition
- **Stage 7**: Admin reports (08:30 cron + `/report` command)
- **Stage 8**: Polish (admin commands, edge cases, error handling, structured logging)

## `.env` template

See `.env.example`. Required: `BOT_TOKEN`, `ADMIN_TELEGRAM_ID`. Optional with defaults: `TZ` (Asia/Tashkent), `DATABASE_*`, `NODE_ENV` (development).
