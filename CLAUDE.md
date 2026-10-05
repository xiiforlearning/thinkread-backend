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

**Decision 01.10.2026 — the student uses only the Mini App.** The bot in private chat is a
door: every message gets one line and an "open the app" button (`WEBAPP_URL`), plus reminders
later. No free-text AI chat for students: AI sits behind forms as structured, forced-tool calls
(report intake, word list parsing, enrichment, sentence check, authenticity, spot-check grading).
Registration (first and last name) happens in the Mini App. The dialog `AgentService` and its
tools stay in the code for the teacher's per-student chat and as a fallback, but no student
traffic goes through them.

**Current stage:** stage 6 in progress — REST API: `POST /auth/webapp` (initData → status
NOT_MEMBER / PENDING_NAME / ACTIVE / ARCHIVED + JWT), `POST /auth/telegram-login` (dashboard,
staff only), all `/me/*` endpoints (profile, register, calm mode, progress, calendar, words,
imports, export, reports with CLARIFY round-trip, recommendations, spot check). Next: `/admin/*`
(students, flags, groups, word lists with coverage, membership checks, settings, AI usage),
then stage 7 cards and stage 8 reminders — all API-first.

### REST API (`infra/api`)

- Auth: `telegram-signature.ts` verifies initData (`HMAC("WebAppData", token)`) and the Login
  Widget (`SHA256(token)`); `AuthService.webApp()` calls `RegistrationService.resolve()` and
  signs a JWT whose claims carry `studentId`, status and roles. `JwtAuthGuard` → `req.principal`,
  `StudentGuard` → `req.student` (ACTIVE only unless `@AllowPendingName()`), `@Roles()` for staff.
- Every success is `{ data }` (lists return `{ data, meta: { nextCursor } }`), every failure
  `{ error: { code, message, details? } }` with the `{level}{service}{error}` code; the HTTP
  status comes from the error code table in `common/http.ts`.
- Controllers are thin (DTO validation with class-validator, serializers in `me/serializers.ts`);
  rules live in domain services. `ReportIntakeService` (domain/ai) is the form-side twin of the
  chat tools: one forced-tool parse, `missingListeningFields`, a draft in
  `dialog_state.reportDraft` while the student answers one clarification, then save + words +
  background checks. `SpotCheckGraderService` grades the Mini App answer with one forced-tool
  call; the verdict is never returned to the student.
- Env: `JWT_SECRET` (required), `WEBAPP_URL`, `CORS_ORIGINS`. Throttling: 60 req/min per IP,
  stricter on auth and AI endpoints.

### AI layer (`domain/ai`)

- `LLM_PORT` is the only way to reach the model; `infra/ai/AnthropicModule` provides it globally.
- A tool = one class implementing `AgentTool` (`name`, `description`, JSON-schema `inputSchema`,
  `handle(input, ctx)`), registered in `TOOL_CLASSES` in `ai.module.ts`. Tools get the caller via
  `ctx.student` — never accept a student id from the model. Return `{ data }` (short JSON for the
  model) and optionally a `keyboard`.
- Prompt caching: `buildSystemPrompt()` and the sorted tool list are the cached prefix — keep them
  free of dates, names and counters. Volatile context goes into `buildStateBlock()` on the current
  user turn. A cache miss on a follow-up turn is logged as a warning.
- History (`ai_messages`) stores user text and the assistant's final text only; every call is
  logged to `ai_usage` with an estimated cost (`usage.service.ts` pricing table).
- Prompt/tool changes: run `pnpm ai:eval` (real API) and keep `scripts/ai-eval.cases.json` growing.

### Reports and flags (`domain/reports`, `domain/flags`)

- `listening-fields.ts` is the source of truth for what a listening report must contain per
  `ListeningMethod`; the tool returns `missing_fields` and the model asks for exactly those.
  A retelling shorter than `MIN_RETELLING_CHARS` counts as missing.
- `ReportsService.weekProgress()` counts reports by `week_start` (Monday, Asia/Tashkent) — the
  weekly norm. The agent puts it into the state block on every turn.
- One report per type per local day (`norms.maxReportsPerTypePerDay`, customer decision): the
  save tools return `reason: DAILY_LIMIT` without saving, and the state block tells the model
  what was already handed in today so it does not ask follow-up questions.
- Customer decisions of 30.09.2026 live in `globalConfig`: 1 correct answer per card stage,
  learned after 1 success on stage 3, intervals 1/3/7 kept after a mistake, ≤2 stage-3 cards in
  a row; `words.priority` (HIGH for manually added and teacher-list words) orders the queue;
  `FlagKind.NORM_MISSED_WEEK` = no reports at all in a week; `AiPurpose.TEACHER_CHAT` for the
  teacher's per-student AI chat (stage 7). Enum changes need a hand-written CHECK rewrite in the
  migration — TypeORM does not diff CHECK expressions.
- `AuthenticityService` (in `domain/ai`) runs after a save via `checkLater()` — fire-and-forget,
  never awaited by the tool. Deterministic signals (forwarded message, first-pass % jump) are
  flagged by code; style signals come from one forced-tool model call (`AiPurpose.AUTHENTICITY`).
  Flags are quiet: never mentioned to the student, no automatic action.
- Spot checks: for no-transcript listening reports the check may plant a question
  (`spotCheckProbability`); it lives in `dialogState.pendingSpotCheckId`, is shown in the state
  block until answered, and expires to `NO_ANSWER` after `spotCheckExpiryDays`.

### Vocabulary (`domain/words`)

- `normalize.ts`: `lemmaOf()` is the dedupe key (lower case, no punctuation, no leading "to "),
  `parseWordList()` reads free text / files ("word — translation", commas, numbering).
- `WordsService.addWords()` never duplicates (checks lemma and lower(word)), returns
  `{ added, existing, learned }`; manual, import and teacher-list words get `priority: HIGH`.
- `WordImportsService`: more than `words.bulkImportConfirmThreshold` words → PENDING preview,
  confirmed by the `wimport:ok:<id>` / `wimport:no:<id>` callbacks in the bot; expires after
  `importPreviewTtlHours`. File uploads (`infra/bot/utils/word-file.ts`, `xlsx` for spreadsheets)
  go through the same preview.
- `EnrichmentService` (`domain/ai`) fills `word_lexicon` once per lemma with one forced-tool
  call per batch of 25 (`AiPurpose.ENRICH_WORDS`), then `applyLexicon()` copies translation /
  example / CEFR into word rows that lack them. Small adds enrich synchronously so the reply can
  show translations; bulk and report words use `enrichLater()`.
- `WordListsService`: teacher lists (`word_lists`, `word_list_items`, `word_list_dismissals`);
  `recommendedFor(student)` = items of active lists for the student's groups / level / everyone,
  minus owned lemmas, minus dismissed. Accepting adds with `source: TEACHER`, `sourceListId`.
- A tool may return `document` (filename + content); the bot sends it after the text reply.

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
