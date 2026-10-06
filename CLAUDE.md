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

**Current stage:** stages 6–8 done — REST API (`/auth/*`, all `/me/*` including cards,
`/admin/*`), the Mini App and the web dashboard (`frontend/admin.html`) on it, scheduled
reminders, the Monday summary with the `NORM_MISSED_WEEK` flag, the teacher's AI chat and the
parents' report (`domain/notify`, `infra/scheduler`, `TeacherChatService`). Next: production
rollout (hosting, the real bot, `AI_MODE=anthropic`) and polishing with the customer.

### Mini App (`frontend/`)

- Separate Vite project (React 19 + TS, TanStack Query, React Router with hash routing) in
  `frontend/` — its own `package.json`, lockfile and CI job; the Nest build never touches it.
- UI = ThinkRead Design System: `src/ui/tokens.css` and `components.css` are verbatim copies of
  the artifact, `src/ui/components.tsx` is the React port of its bundle. Screens are transcribed
  from the artboards of «ThinkRead — кликабельный дизайн»; keep them in sync when a screen changes.
- `src/api/types.ts` mirrors `me/serializers.ts`; `Api` (client.ts) has two implementations:
  `HttpApi` (real backend, JWT in sessionStorage) and `MockApi` (in-memory demo with the same
  rules). Outside Telegram or with `VITE_DEMO=1` the app runs on the mock — that is the demo.
- Commands: `pnpm dev | build | lint | typecheck | format`. `pages.yml` deploys the demo to
  GitHub Pages; the production build goes to `WEBAPP_URL`.
- **Dashboard** = the second Vite page `admin.html` → `src/admin/`: `api.ts` (`AdminApi` types
  mirror `admin/serializers.ts`; `HttpAdminApi`), `mock.ts` (`MockAdminApi`, the demo school),
  `session.tsx` (Telegram Login Widget → `POST /auth/telegram-login`, dev token, demo; JWT in
  localStorage), `Shell.tsx` (sidebar + optional list pane), `screens/` transcribed from the
  AdminOverview / AdminStudents / AdminFlags / AdminGroups / AdminSettings artboards. Desktop
  variants of the components (`desktop` prop, `NavItem`, `HealthDot`, `ChatMessage`, `Composer`)
  live in `components.tsx`, layout classes `ad-*` in `admin.css`. `AdminApi.features` marks the
  stage-8 AI features (teacher chat, parents' report) that only the mock serves for now.

### REST API (`infra/api`)

- Auth: `telegram-signature.ts` verifies initData (`HMAC("WebAppData", token)`) and the Login
  Widget (`SHA256(token)`); `AuthService.webApp()` calls `RegistrationService.resolve()` and
  signs a JWT whose claims carry `studentId`, status and roles. The owner and teachers are group
  admins, so `RegistrationService.resolve(user, { staff: true })` answers `STAFF` instead of
  registering them as students; the Mini App then hands them to `admin.html` with the same JWT
  (`openDashboard()` writes the dashboard's localStorage session). A staff member who already is
  an ACTIVE student keeps the student flow and gets a dashboard link in the profile. `JwtAuthGuard` → `req.principal`,
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
- `/admin/*` (`api/admin`): `@Roles(OWNER, TEACHER)`; `AdminScopeService` turns the principal
  into a scope — the owner sees everything, a teacher only the active groups they teach
  (`AccessService.visibleGroupIds`) and the students in them; owner-only actions call
  `scope.assertOwner()`. Lists are built from batch queries (`ReportsService.countsByWeek`,
  `WordsService.countsFor`, `FlagsService.countNewByStudent`), never per student.
  `domain/students/health.ts` is the one health function (silence days + blocked bot) for the
  dashboard, the Mini App and the summary.
- Settings: `SettingsService` keeps owner overrides of `globalConfig` in the `settings` table and
  writes them into `globalConfig` in place at boot and on every change, so the rest of the code
  keeps reading `globalConfig`. Only the keys in `EDITABLE_SETTINGS` (with ranges) can change.

### AI layer (`domain/ai`)

- `LLM_PORT` is the only way to reach the model; `infra/ai/AnthropicModule` provides it globally
  and `AI_MODE` picks the adapter: `anthropic` (API key), `claude-cli` (`ClaudeCliLlmAdapter`
  runs the local Claude Code CLI with `--json-schema`, signed in with the developer's account —
  development and demos without a key) or `fake` (`FakeLlmAdapter`, deterministic, CI; the
  default when there is no key).
- **AI skills** (`domain/ai/skills.ts`): every job the product gives the model is one entry —
  system prompt, forced tool, example input and a rule-based `simulate()` (`simulate.ts`). The
  services build their requests from the same prompt files; the fake adapter and
  `pnpm ai:skill <name> "<text>"` look skills up here. A new AI feature = a `*.prompt.ts`, a
  skill entry with a simulator, a spec, and an eval case.
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

### Cards (`domain/cards`)

- `CardsService` holds the customer's rules in one place: `queue()` = due LEARNING words ordered
  overdue → priority HIGH → due, with `capStage3()` keeping at most `cards.maxStage3InRow`
  stage-3 cards in a row; `next()` resumes the open attempt or shows the queue head (words
  skipped today are left out); `answer()` checks stages 1–2 against `prompt.acceptedAnswers`
  (word, lemma, lexicon forms, via `normalizeAnswer`) and stage 3 through `SentenceCheckService`
  (one forced tool `sentence_verdict`, `AiPurpose.SENTENCE_CHECK`; an outage counts as correct);
  `apply()` moves the stage after `correctToAdvance`, marks LEARNED after `stage3ToLearned` on
  stage 3, schedules `intervalsDays` by `correctTotal`, a mistake or "не помню" = tomorrow with
  stage and intervals kept. `today()` counts answered attempts since local midnight — the daily
  norm; extra cards after the norm are plain answers (the Mini App shows them as an extra series).
- A `CardAttempt` is created when the card is shown (`channel MINI_APP`, `prompt` stored so the
  answer is checked against what was actually displayed) and completed by answer, give-up or skip.
  Stage-2 material comes from `word_lexicon.gapSentences`, else the example with the word masked,
  else the card falls back to translation → word. `/me/cards` (state), `POST /me/cards/next`,
  `/:attemptId/answer | give-up | skip`.

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

### Reminders and the weekly summary (`domain/notify`, `infra/scheduler`)

- `ReminderPlannerService.runCards()` / `runReports()` pick who gets a DM: active students only,
  norm not met, not reminded today on any channel (`RemindersService`, the AI's woven reminder
  counts), not in calm mode (`dialogState.tiredUntil`), not `dmBlocked`; each send is logged
  `SCHEDULED` so re-runs are idempotent. Reports go out on `reminders.reportDays` (Thu, Sat).
  `RemindersCron` ticks every minute and fires each run once per local day within two hours after
  `reminders.cardsTime` / `reportsTime` (owner settings, read at run time).
- `WeeklySummaryService.build()` = last week's rates with deltas, health, per-group rates, the
  no-shows, top readers; `run()` raises `NORM_MISSED_WEEK` once per student and week (reason
  carries the week label) and sends the owner the whole school, each teacher their groups.
  `WeeklySummaryCron` runs Monday 09:00; `POST /admin/reminders/run`, `GET/POST
  /admin/weekly-summary[/run]` do the same on demand (owner; preview for staff).
- `NotifierPort.sendToUser(id, text, { openApp })` attaches the Mini App button when `WEBAPP_URL`
  is set. Texts live in `domain/notify/messages.ts`.

### Teacher's AI (`domain/ai/teacher-chat.service.ts`)

- `StudentFactsService.collect()` computes everything the model may say: norms per week, reports
  of the period, vocabulary counts, stuck words, flags — the model only explains.
  `TeacherChatService.ask()` (`AiPurpose.TEACHER_CHAT`, forced tool `teacher_reply {text, draft}`)
  answers `POST /admin/students/:id/chat`; `parentReport()` (`AiPurpose.PARENT_REPORT`, tool
  `parent_report`) answers `POST /admin/students/:id/parent-report` for a month. Nothing is
  stored; the dashboard keeps the chat history in memory. Both are AI skills (`teacher_chat`,
  `parent_report`) with simulators for `AI_MODE=fake`.

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

`frontend/` — the Telegram Mini App (see above). Planned: `infra/scheduler/` (reminders, weekly
summary, monthly membership check), `/admin/*` API, web dashboard.

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

## Local run, agents and skills

`.claude/skills/` holds the repo's workflows for Claude Code: `local-run` (Postgres, migrations,
`pnpm dev:seed`, `pnpm dev:api` on the fake AI, `pnpm dev:token` for curl), `verify` (what CI
runs), `api-smoke` (live curl table for `/me/*` and `/admin/*`), `screens` (Playwright
screenshots of the Mini App) and `stage` (how to deliver a plan stage end to end).
`.claude/agents/`: `reviewer` (CLAUDE.md checklist on a diff), `api-tester` (boots the API and
runs the smoke), `screen-checker` (builds the Mini App and compares screens with the artboards).

## Commands

| Command | Purpose |
|---|---|
| `pnpm start:dev` | Run with hot reload |
| `pnpm build` | Compile (strict) |
| `pnpm lint` / `pnpm lint:check` | ESLint + Prettier (fix / check) |
| `pnpm test` | Jest |
| `pnpm verify` | lint:check + build + test (what CI runs for the backend) |
| `pnpm dev:api` | API only: `BOT_LAUNCH=false AI_MODE=fake nest start --watch` |
| `pnpm dev:seed [--reset]` | Demo data of the design artboards (groups, students, reports, words, list, flags) |
| `pnpm dev:token owner \| teacher <tgId> \| student <uuid>` | JWT for curl / Swagger |
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
