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
`/admin/*`), the Mini App and the web dashboard (repo `thinkread-frontend`) on it, scheduled
reminders, the Monday summary with the `NORM_MISSED_WEEK` flag, the teacher's AI chat and the
parents' report (`domain/notify`, `infra/scheduler`, `TeacherChatService`). Next: production
rollout (hosting, the real bot, `AI_MODE=anthropic`) and polishing with the customer.

### Mini App and dashboard (repo `xiiforlearning/thinkread-frontend`)

- Separate repository and Vite project (React 19 + TS, TanStack Query, React Router with hash
  routing), deployed on Vercel; it was split out of `frontend/` here with its history. Changes to
  `me/serializers.ts` or `admin/serializers.ts` must be mirrored there by hand (`src/api/types.ts`,
  `src/admin/api.ts`).
- UI = ThinkRead Design System: `src/ui/tokens.css` and `components.css` are verbatim copies of
  the artifact, `src/ui/components.tsx` is the React port of its bundle. Screens are transcribed
  from the artboards of «ThinkRead — кликабельный дизайн»; keep them in sync when a screen changes.
- `src/api/types.ts` mirrors `me/serializers.ts`; `Api` (client.ts) has two implementations:
  `HttpApi` (real backend, JWT in sessionStorage) and `MockApi` (in-memory demo with the same
  rules). The mock runs only on request (`?demo=1` in the URL or `VITE_DEMO=1` at build time) —
  that is the demo; a plain browser otherwise gets the "open in Telegram" screen
  (`VITE_BOT_USERNAME`). The dashboard shows its demo buttons under the same condition.
- Commands: `pnpm dev | build | lint | typecheck | format`. `pages.yml` deploys the demo to
  GitHub Pages; the production build goes to `WEBAPP_URL`.
- **Dashboard** = the second Vite page `admin.html` → `src/admin/`: `api.ts` (`AdminApi` types
  mirror `admin/serializers.ts`; `HttpAdminApi`), `mock.ts` (`MockAdminApi`, the demo school),
  `session.tsx` (sign-in with the bot's one-time code → `POST /auth/code/verify`; dev token;
  demo; JWT in localStorage), `Shell.tsx` (sidebar + optional list pane), `screens/` transcribed from the
  AdminOverview / AdminStudents / AdminFlags / AdminGroups / AdminSettings artboards. Desktop
  variants of the components (`desktop` prop, `NavItem`, `HealthDot`, `ChatMessage`, `Composer`)
  live in `components.tsx`, layout classes `ad-*` in `admin.css`. `AdminApi.features` marks the
  stage-8 AI features (teacher chat, parents' report) that only the mock serves for now.

### REST API (`infra/api`)

- Auth: `telegram-signature.ts` verifies initData (`HMAC("WebAppData", token)`) and the legacy
  Login Widget (`SHA256(token)`). The dashboard signs in with a one-time code
  (`domain/admins/login-codes.service.ts`): `POST /auth/code/request` makes the bot DM the owner a
  6-digit code, a teacher gets one by writing anything to the bot (`BotUpdate.onMessage`), and
  `POST /auth/code/verify` → `AuthService.codeLogin()` turns it into the staff JWT. Codes live in
  memory, hashed, 5 minutes, single use, 5 wrong guesses burn them, a resend no sooner than 30 s.
  `AuthService.webApp()` calls `RegistrationService.resolve()` and
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
  chat tools: one forced-tool parse of the fields, `missingListeningFields`, a draft in
  `dialog_state.reportDraft` (`stage: CLARIFY`) while the student answers one clarification,
  then one forced-tool call for the student's word list (`ReportWordsService`, skill
  `report_words`) and a `CONFIRM_WORDS` draft — **the report is saved and counted only when the
  student confirms the list** (`POST /me/reports/:draftId/confirm`; `/discard` = back to the
  form, `GET /me/reports/draft` resumes). Customer decision 02.11.2026: words come only from the
  student's explicit list (heading optional), never from the retelling, nothing is suggested; an
  empty list is accepted and marked `noNewWords`. **W6 (teacher 02.11.2026):** `report_words`
  also returns, per word, `context` (the student's own sentence with the word, verified by
  `findQuote`, else found by `sentenceWith()` in `report-text.ts`) → the card's `example`;
  `suggested_translation` only when the student wrote none — by the meaning in this report,
  never the dictionary-first sense (`will` → «воля», not «завещание»); `basic` (A1, the model's
  mark or `words/basic.ts`) → shown unticked and added only if the student ticks it
  (`words.autoAddBasic` = false). `DraftWord` carries `suggested`, `context`, `basic`;
  `confirm()` attaches the draft's context and translation to words the screen sends bare, `norms.minWordsPerReport` (owner setting,
  default 0) can demand a minimum (409 `WORDS_REQUIRED`), two no-word reports in a row raise the
  quiet `NO_NEW_WORDS` flag, `words.maxPerReport` caps one report. `SpotCheckGraderService`
  grades the Mini App answer with one forced-tool call; the verdict is never returned to the
  student.
- Env: `JWT_SECRET` (required), `WEBAPP_URL`, `CORS_ORIGINS`. Throttling: 60 req/min per IP,
  stricter on auth and AI endpoints.
- HTTP log (`common/http-log.ts`, `LOG_HTTP` = `full` by default / `summary` / `off`): one line
  per request after the response — method, path, status, duration, caller (`student:<id>`,
  `tg:<id>:<roles>`, `bearer`, `anon`), request and response bodies. `redact()` hides
  credentials (`initData`, `hash`, `token`, `code`, `password`) and replaces report texts
  (`text`, `summary`, `unclearParts`) with their length; `error.code` stays. `/health` is skipped.
- `/admin/*` (`api/admin`): `@Roles(OWNER, TEACHER)`; `AdminScopeService` turns the principal
  into a scope — the owner sees everything, a teacher only the active groups they teach
  (`AccessService.visibleGroupIds`) and the students in them; owner-only actions call
  `scope.assertOwner()`. Lists are built from batch queries (`ReportsService.countsByWeek`,
  `WordsService.countsFor`, `FlagsService.countNewByStudent`), never per student.
  `domain/students/health.ts` is the one health function (silence days + blocked bot) for the
  dashboard, the Mini App and the summary. Teacher's feedback 02.11.2026 (D1–D3, D7):
  `GET /admin/overview` carries `stats.reportsThisWeek/reportsLastWeek` (raw counts with the
  reading/listening split), `flagsRaisedThisWeek`, `aiMonth` (owner only), `latestReports`
  (20 newest reports with the student and the week cell) and a `topReaders` ranked by the norm
  (both norms met → filled windows → reports → pages; students with a REVIEWED flag on a report
  of the week are excluded — `FlagsService.confirmedInWeek`). `GET /admin/reports/:id`
  (`AdminReportsController`) returns any visible report in full — raw text, parse, AI metrics,
  the words it added, its flags; the dashboard opens it from every feed.
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

- Words of a report are extracted by `report_words` (`report-words.prompt.ts`) from the
  student's text alone, in dictionary forms (`NEW_WORDS_DESCRIPTION`: infinitive without "to",
  singular; a phrasal verb only when the particle changes the meaning, otherwise one word —
  customer decision 25.10.2026), with the student's own translations, proper names skipped. The
  field parse (`parsed_report`) does not touch words. `extractWordList()` in `words/normalize.ts`
  is the rule-based twin (fake adapter, model-outage fallback).
- `listening-fields.ts` is the source of truth for what a listening report must contain per
  `ListeningMethod`; the tool returns `missing_fields` and the model asks for exactly those.
  A retelling shorter than `MIN_RETELLING_CHARS` counts as missing.
- **Submission windows (N1, customer 02.11.2026):** a week has three windows per report type —
  Mon–Tue, Wed–Thu, Fri–Sun (`norms.slotWindows`, local days; `slotOf()`, `slotViews()`,
  `daysLeftInSlot()` in `norms/week.ts`). A report is stamped with `reports.slot` when saved;
  `ReportsService.weekProgress()` / `countsByWeek()` / `calendar()` count **filled windows**
  (`COUNT(DISTINCT slot)`), not reports, against the owner's weekly norm. A second report in an
  already filled window is saved (words included) but opens no slot — the intake answers
  `slotClosed: true`; a missed window burns (`state: missed`). Report reminders go out on the
  last day of each window (`reminders.reportDays` = Tue, Thu, Sun) and speak of the window that
  closes. For the AI (N2) `StudentFactsService` / `SchoolFactsService` count `weeksMet` over
  completed weeks only and describe the current week as "ещё идёт, окно N закрывается <дата>";
  the level comes from `students.level`, `dmBlocked` is explained in the prompts as Telegram's
  "bot was blocked" on send, never guessed at.
- **Daily word cap (W4):** `words.maxPerDay` (30, owner setting) across reports, manual adds and
  imports — `WordsService.dailyRoom()`; the words beyond it are left out and reported as
  `droppedDaily`, never silently.
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
  never awaited by the tool. The model never judges (teacher's decisions of 02.11.2026, F1–F5):
  one forced-tool call `report_evidence` returns **observations with exact quotes** — content
  findings (`GENERIC_RETELLING`, `REPEATED_RETELLING`, the latter with a quote from the earlier
  report too), every language error of the prose and the fragments above the student's level.
  Code verifies each quote against the student's text (`findQuote` in `report-text.ts`; the AI
  summary is never an input), stores `ReportMetrics` (`reports.ai_metrics`: words, errors per
  100, advanced fragments) and decides the style flags from the numbers: `STYLE_MISMATCH` /
  `TOO_POLISHED` need a baseline of ≥ `ai.authenticityMinHistory` measured connected reports of
  the same type and the thresholds in `globalConfig.ai.style`. Deterministic signals stay in
  code: forwarded message, first-pass % jump, the same episode of a series handed in twice
  (F10). `dedupeText()` drops a message sent twice before parsing (F9). One card per report:
  several signals become `flags.kinds` with per-kind `reasons` and `claims` in `details`
  (`FlagsService.raise` merges). Flags are quiet: never mentioned to the student, no automatic
  action. Offline replay on real flags: an eval script kept outside the repository (students'
  texts).
- Spot checks: for no-transcript listening reports the check may plant a question
  (`spotCheckProbability`); it lives in `dialogState.pendingSpotCheckId`, is shown in the state
  block until answered, and expires to `NO_ANSWER` after `spotCheckExpiryDays`. **F7:** the
  grader (`spot_check_grade`) sees the whole `rawText`, not the retelling alone; OK needs one
  concrete detail in the student's own words (no verbatim quote), VAGUE is only "fits any
  episode", WRONG only a contradiction; it returns `evidence`, kept when `findQuote` finds it,
  and the flag's `details.spotCheck = { question, answer, verdict, quote }` shows all three on
  the card.

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
  else the card falls back to translation → word. `/me/cards` (state; `queue` is counts only —
  the words would be the answers of the next cards), `GET /me/cards/queue` (the queue screen:
  card order, the translation on stages 1–2 and the word on stage 3, so the student manages
  priority without a cheat sheet; customer decision 25.10.2026), `POST /me/cards/next`,
  `/:attemptId/answer | give-up | skip`.

### Vocabulary (`domain/words`)

- `normalize.ts`: `lemmaOf()` is the dedupe key (lower case, no punctuation, no leading "to "),
  `parseWordList()` reads free text / files ("word — translation", commas, numbering, several
  pairs glued on one line are split — W3), `extractWordList()` finds the explicit list inside a
  report.
- `WordsService.addWords()` never duplicates (checks lemma and lower(word)), returns
  `{ added, existing, learned }`; manual, import and teacher-list words get `priority: HIGH`.
- `WordImportsService`: more than `words.bulkImportConfirmThreshold` words → PENDING preview,
  confirmed by the `wimport:ok:<id>` / `wimport:no:<id>` callbacks in the bot; expires after
  `importPreviewTtlHours`. File uploads (`infra/bot/utils/word-file.ts`, `xlsx` for spreadsheets)
  go through the same preview.
- `EnrichmentService` (`domain/ai`) fills `word_lexicon` once per lemma with one forced-tool
  call per batch of 25 (`AiPurpose.ENRICH_WORDS`), then `applyLexicon()` copies translation /
  example / CEFR into word rows that lack them. Small adds enrich synchronously so the reply can
  show translations; bulk and report words use `enrichLater()`. `LexiconService.upsert()` writes
  one row per statement and drops duplicate lemmas (the model may repeat one; a multi-row upsert
  then fails whole). `enrichMissing()` (`POST /admin/words/enrich-missing`, count via
  `GET /admin/words/lexicon-gaps`) catches up on words whose lemma never reached the lexicon.
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
- **`norms.startsOn`** (owner setting, YYYY-MM-DD, default the Monday after the move to
  ThinkRead): the school counts from this local day. Before it `silentDays()` reports 0 (health is
  green for the migrated students), `WeeklySummaryService.run()` skips a week that ends earlier
  (no `NORM_MISSED_WEEK`, nothing sent) and both reminder runs stay quiet (`normsStarted()` in
  `norms/week.ts`). Empty = from the beginning.

### Teacher's AI (`domain/ai/teacher-chat.service.ts`)

- `StudentFactsService.collect()` computes everything the model may say: norms per week, reports
  of the period, vocabulary counts, stuck words, flags — the model only explains.
  `TeacherChatService.ask()` (`AiPurpose.TEACHER_CHAT`, forced tool `teacher_reply {text, draft}`)
  answers `POST /admin/students/:id/chat`; `parentReport()` (`AiPurpose.PARENT_REPORT`, tool
  `parent_report`) answers `POST /admin/students/:id/parent-report` for a month. Nothing is
  stored; the dashboard keeps the chat history in memory. Both are AI skills (`teacher_chat`,
  `parent_report`) with simulators for `AI_MODE=fake`.
- **School-wide AI** (`school-facts.service.ts`, `school-chat.service.ts`): `SchoolFactsService.collect()`
  builds the facts of the whole school (owner) or the caller's groups (teacher): per-week norm
  rates, health, new flags, per-student rows (reports per week, norms met, words), the no-shows
  and top readers of the current week — batch queries only, no report texts.
  `SchoolChatService.ask()` (`AiPurpose.SCHOOL_CHAT`, forced tool `school_reply {text}`) answers
  `POST /admin/chat` («кто отстаёт», «сравни группы», итоги недели); skill `school_chat` with a
  simulator. Usage is logged without a student.

### Student language (`domain/students/language.ts`)

- **Decision 25.10.2026: the product is English for everyone, no switch.** `DEFAULT_LANG = 'en'`;
  a new student is created with `language: EN`; the Mini App pins `FIXED_LANG = 'en'` and hides
  both switches. The Russian texts, `students.language`, `PATCH /me/language` and the switches
  stay wired so the choice can be reopened by setting `DEFAULT_LANG` / `FIXED_LANG` back.
- `students.language` (`StudentLanguage` ru | en, CHECK) is the one switch for everything the
  student reads from the backend: `langOf(student)` = the stored value, else `DEFAULT_LANG`.
  `PATCH /me/language` (allowed while PENDING_NAME) changes it; `profileView.language` returns it.
- Per-language text objects live next to each other: `studentMessagesFor(lang)`
  (`students/messages.ts`), `cardMessagesFor(lang)` (`cards/messages.ts`: questions, placeholders,
  stage labels, feedback), `reminderMessagesFor(lang)` (`notify/messages.ts`). The bot's gate,
  the Mini App button caption (`NotifyOptions.lang`), the intake clarification question
  (`ReportIntakeService.question`), the stage-3 grammar hint (`feedback_language` in the
  sentence check's user turn) and the AI spot-check question (`question_language`) all follow
  `langOf(student)`. Staff texts, the weekly summary and the teacher's AI stay Russian. The bot
  profile texts are set for the default and for `en`.
- The Mini App keeps its own dictionaries (`src/i18n/`, ru and en complete); `LanguageSync`
  applies `profile.language` only when the switch is enabled.

### Migration from the old bot

`scripts/legacy-export.sql` (two JSON selects on the old database) + `pnpm ops:import-legacy`
load groups, students (`PENDING_NAME`, name prefilled) and `student_groups`;
`pnpm ops:announce --send` posts the move-over message in every active group with a
`?startapp` link that opens the Mini App in the group (needs a Main Mini App in @BotFather;
`--via-chat` falls back to `?start=app`). Steps and order: README «Migration from the old bot».

### Groups join with the owner's approval

Anyone can add a public bot to a chat, so `GroupsService.upsert()` creates an unknown group
**inactive**; only active groups grant student access (`findAllActive` in the membership lookup)
and teacher access (`findActiveByTeacher`). The owner's DM carries the level buttons
(`approve()` = level + active) and «Не наша группа» (`deactivate()` + `leaveChat`). A known group
with a level comes back active when re-added. Decision 25.10.2026.

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

The Telegram Mini App and the dashboard live in the `thinkread-frontend` repository (see above).
Deploy: `Dockerfile` (migrations, then `start:prod`), `render.yaml` (Render Blueprint) or
`railway.json`; `GET /health` is the liveness probe.

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
- User-facing text lives in `messages.ts` per module, in Russian and English (see Student language). Never log message text
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
