# ThinkRead — backend

AI Telegram bot for an English school, plus the REST API behind its Telegram Mini App and
admin dashboard. Students write to the bot in free text (a reading report, a listening report,
a word to add, "give me a card") and the AI understands the intent. The teacher gets a dashboard
instead of text reports in a chat.

Full spec: Notion workspace **ThinkRead**. Developer notes: [CLAUDE.md](CLAUDE.md).

## Stack

NestJS 10 · TypeScript (strict) · PostgreSQL 16 + TypeORM (migrations only) · telegraf ·
Claude API (tool calling) · Docker Compose · Railway.

## Quick start

```bash
cp .env.example .env
# fill in BOT_TOKEN and ADMIN_TELEGRAM_ID
docker compose up --build
```

Postgres starts, migrations run, the bot connects via long polling. Swagger: `http://localhost:3000/docs`,
Adminer: `http://localhost:8080`.

Without Docker: a local Postgres, then `pnpm install && pnpm migration:run && pnpm start:dev`.

## Scripts

| Command | Purpose |
|---|---|
| `pnpm start:dev` / `pnpm start:prod` | Run |
| `pnpm build` | Compile |
| `pnpm lint` / `pnpm lint:check` | ESLint + Prettier |
| `pnpm test` | Jest |
| `pnpm migration:run` / `migration:revert` / `migration:show` | Migrations |
| `pnpm ops:announce [--send] [--only=<chatId,…>]` | Post the «we moved to ThinkRead» message in every active group (dry run without `--send`) |

## Environment

| Variable | Required | Description |
|---|---|---|
| `BOT_TOKEN` | yes | Telegram bot token |
| `ADMIN_TELEGRAM_ID` | yes | Telegram id of the school owner |
| `DATABASE_URL` or `DATABASE_HOST/PORT/USER/PASSWORD/NAME` | yes | PostgreSQL |
| `DATABASE_SSL` | no | `true` for managed Postgres |
| `ANTHROPIC_API_KEY` | yes | Claude API key (student dialog) |
| `AI_MODE` | no | `anthropic` / `claude-cli` / `fake` — who answers the AI calls (see below) |
| `CLAUDE_CLI_PATH`, `CLAUDE_CLI_MODEL`, `CLAUDE_CLI_TIMEOUT_MS` | no | For `AI_MODE=claude-cli`: binary (`claude`), model alias (`haiku`), timeout (120000) |
| `AI_MODEL_DIALOG` | no | Default `claude-haiku-4-5` |
| `AI_MODEL_AUTHENTICITY` | no | Report authenticity check; defaults to `AI_MODEL_DIALOG` |
| `JWT_SECRET` | yes | Signs the API's JWTs |
| `WEBAPP_URL` | no | Public HTTPS URL of the Mini App (the bot's "open" button) |
| `CORS_ORIGINS` | no | Comma-separated origins allowed to call the API |
| `BOT_LAUNCH` | no | `false` boots without Telegram polling |
| `TZ` | no | Default `Asia/Tashkent` |
| `NODE_ENV` | no | `development` / `production` |

## AI eval

`pnpm ai:eval` sends the cases in `scripts/ai-eval.cases.json` to the real model and checks which
tool it calls. It spends tokens and needs `ANTHROPIC_API_KEY`; run it after any prompt or tool
change (pass threshold 95%).

## Status

The student works only in the Telegram Mini App (decision of 01.10.2026); the bot in private chat
only sends reminders and opens the app. Stages 0–8 are done: data model, groups and registration,
AI core, reports, vocabulary, the REST API (student `/me/*`, staff `/admin/*`), the Mini App with
cards, the web dashboard, scheduled reminders, the Monday summary with the `NORM_MISSED_WEEK`
flag, the teacher's AI chat and the parents' report. Next: production rollout with the customer.

## AI modes and skills

`AI_MODE` decides who answers the product's AI calls:

| Mode | When | Needs |
|---|---|---|
| `anthropic` | production | `ANTHROPIC_API_KEY` |
| `claude-cli` | local development and demos — the backend runs the Claude Code CLI installed on the machine (`claude -p --json-schema …`), signed in with your own account | `claude` on PATH and `claude login` done |
| `fake` | CI, tests, offline — rule-based stub with deterministic answers | nothing |

Every AI job is a **skill** in `src/domain/ai/skills.ts` (prompt + forced tool + simulator):
`parse_reading_report`, `parse_listening_report`, `enrich_words`, `authenticity`,
`spot_check_grade`, `sentence_check`. Run one from the terminal to tune a prompt:

```bash
pnpm ai:skill                                            # list
AI_MODE=claude-cli pnpm ai:skill parse_listening_report "слушал 6 Minute English, 70%, 3 раза. The episode was about sleep."
```

## Local run

Everything runs without `ANTHROPIC_API_KEY`: set `AI_MODE=claude-cli` to use your local Claude
Code, or leave it on the rule-based stub (`fake`). Telegram polling is off with `BOT_LAUNCH=false`.

```bash
docker compose up -d postgres && cp -n .env.example .env   # fill ADMIN_TELEGRAM_ID, JWT_SECRET, BOT_TOKEN (any 123:abc)
pnpm install && pnpm migration:run && pnpm dev:seed        # demo data from the design artboards
pnpm dev:api                                               # http://localhost:3000/docs
pnpm dev:token owner                                       # Bearer token for /admin/*; also: teacher 777, student <uuid from the seed>
git clone https://github.com/xiiforlearning/thinkread-frontend && cd thinkread-frontend && pnpm install && pnpm dev   # Mini App on demo data at http://localhost:5173
```

To show the real thing in Telegram: create a bot in @BotFather (`/newbot` → `BOT_TOKEN`), set
`BOT_LAUNCH=true`, expose the Mini App over HTTPS (for example `cloudflared tunnel --url
http://localhost:5173`), put that URL into `WEBAPP_URL`, `CORS_ORIGINS` and the frontend's
`VITE_API_URL` (pointing at a tunnel to :3000), then `/newapp` or the menu button in @BotFather
with the same URL. Details and the curl smoke table: `.claude/skills/local-run/SKILL.md`,
`.claude/skills/api-smoke/SKILL.md`.

## Student language

The product is English for every student (decision 25.10.2026): bot replies, reminders, the Mini
App button, card questions and feedback. The Russian texts are kept: `PATCH /me/language`
`{ language: "ru" | "en" }` still stores a choice and `GET /me` returns it as `language`, but the
Mini App shows no switch while `FIXED_LANG` is set (see `domain/students/language.ts`).

## Cards API (`/me/cards`)

| Endpoint | What |
|---|---|
| `GET /me/cards` | today's norm (`done / correct / norm`), queue counts (`due / overdue / priority` — numbers only, the words would be the answers), the card currently shown |
| `GET /me/cards/queue` | the queue in card order (overdue → priority → due) for the queue screen: the translation on stages 1–2, the word on stage 3; priority and «learned» are changed through `/me/words/:id` |
| `POST /me/cards/next` | show the next card (resumes an unanswered one); `card: null` when nothing is due |
| `POST /me/cards/:attemptId/answer` `{ answer }` | stages 1–2 checked locally, stage 3 by AI; returns `correct`, `message`, `feedback`, the word's new stage / status |
| `POST /me/cards/:attemptId/give-up` | «не помню» — a mistake, the word returns tomorrow |
| `POST /me/cards/:attemptId/skip` | put aside for today, nothing changes |

## Dashboard API (`/admin/*`)

Staff only (`OWNER` sees everything, a `TEACHER` only their groups), Bearer JWT from
`POST /auth/code/verify` — the 6-digit one-time code the bot sent to the staff member's chat
(`POST /auth/code/request` sends one to the owner; a teacher gets one by writing anything to the
bot; 5 minutes, single use) — or the legacy Login Widget payload on `POST /auth/telegram-login`:

| Endpoint | What |
|---|---|
| `GET /admin/overview?week=this\|last` | norm rates with deltas, health by group, 8-week history, top readers, attention list |
| `GET /admin/students`, `GET /admin/students/:id`, `/:id/reports`, `/:id/words` | list with health / silence / norms / flags, one student's card |
| `PATCH /admin/students/:id`, `POST …/archive`, `…/restore`, `…/recheck` | rename (owner), archive / restore (owner), membership re-check |
| `GET /admin/flags`, `GET /admin/flags/:id`, `POST /admin/flags/:id/review` | quiet flags inbox with the flagged report and previous ones; «проверено» / «ложная тревога» |
| `GET /admin/groups`, `PATCH /admin/groups/:chatId` | groups with level, teachers, members, this-week rates; set level (owner) |
| `GET /admin/membership-checks`, `POST …/run` | history of the monthly check; run now (owner, background) |
| `GET/POST /admin/word-lists`, `GET/PATCH /admin/word-lists/:id` | teacher word lists with coverage (addressed / added / learned / hidden) |
| `GET/PATCH /admin/settings`, `DELETE /admin/settings/:key` | owner overrides of norms, reminders, health thresholds, AI limits |
| `POST /admin/chat` | the school-wide AI: a question about the whole school (owner) or the caller's groups (teacher), answered from computed facts |
| `GET/POST /admin/staff`, `DELETE /admin/staff/:telegramUserId` | teachers: explicit grants plus group-title detection |
| `GET /admin/ai-usage?month=YYYY-MM` | AI spend: totals, by purpose, top students |
| `POST /admin/students/:id/chat`, `POST …/parent-report` | the teacher's AI about one student (facts computed by the system); the parents' report for a month |
| `POST /admin/reminders/run`, `GET /admin/weekly-summary`, `POST …/run` | send today's reminders now (owner); preview / send the Monday summary |

## Deploy

The backend is one long-running process (REST API, Telegram long polling, minute-level crons), so
it needs a host that keeps a container alive — not a serverless platform. `Dockerfile` runs the
migrations and then `start:prod`; `GET /health` is the liveness probe.

- **Render**: New → Blueprint → this repo (`render.yaml` creates the web service and a Postgres);
  then fill `BOT_TOKEN`, `ADMIN_TELEGRAM_ID`, `ANTHROPIC_API_KEY`, `WEBAPP_URL`, `CORS_ORIGINS`.
- **Railway**: New project → Deploy from GitHub repo (the Dockerfile is detected, `railway.json`
  sets the health check) → add a Postgres → set the same variables plus `DATABASE_URL`
  (`${{Postgres.DATABASE_URL}}`), `DATABASE_SSL=true`, `NODE_ENV=production`, `AI_MODE=anthropic`,
  `JWT_SECRET`, `TZ=Asia/Tashkent`.

In the service shell on Railway the ops scripts work as locally: `pnpm dev:token owner` (a JWT for
curl against the live API), `pnpm ai:skill parse_reading_report "…"` (one real call of a product
skill through the configured `AI_MODE` / key), `pnpm ai:eval`.

The frontend is static and lives on Vercel (see its repository); `WEBAPP_URL` is the Vercel site
root and `CORS_ORIGINS` its origin. At boot the bot configures itself from `WEBAPP_URL` (menu
button «Открыть ThinkRead», profile texts, no slash commands); nothing else is needed in
@BotFather — the dashboard signs in with a one-time code the bot sends in Telegram.

## Migration from the old bot (english-bot)

The school keeps the old bot's token: the bot is already in every study group, so no group has
to add anything. Groups and students come over by SQL; words, reports and reading progress do
not (customer decision 25.10.2026). Order matters:

1. **Stop the old bot** (its deployment), otherwise two processes poll one token.
2. **Export from the old database** — `scripts/legacy-export.sql` prints ready SQL for the new one:
   ```bash
   psql "$OLD_DATABASE_URL" -At -v owner_telegram_id=<ADMIN_TELEGRAM_ID> \
     -f scripts/legacy-export.sql > legacy.sql
   ```
   Active groups (chat id, title, teachers) and their students as `PENDING_NAME` with the old
   name split into first / last as a prefill; the owner and the teachers are skipped.
3. **Import into the new database**: `psql "$DATABASE_URL" -f legacy.sql` (re-runnable).
4. **Point ThinkRead at the old token**: `BOT_TOKEN` of the old bot, deploy. At boot the bot
   rewrites its menu button, profile texts and commands for ThinkRead.
5. **Dashboard → Groups**: set the level of every group, then «Check membership»: every student
   gets the level of their group and the links are confirmed against Telegram.
6. **Announce in the groups**: `pnpm ops:announce` (dry run) and `pnpm ops:announce --send`
   from the service shell. The post links to `t.me/<bot>?start=app`; the bot answers with the
   «Open ThinkRead» button, the Mini App asks for the real first and last name (prefilled from
   the old name) and the student becomes ACTIVE. Until then the dashboard lists them as
   pending; reminders go only to ACTIVE students.

## Mini App and dashboard (separate repository)

The student's Telegram Mini App and the owner's web dashboard live in
[https://github.com/xiiforlearning/thinkread-frontend](https://github.com/xiiforlearning/thinkread-frontend) — React + Vite on the ThinkRead Design System, deployed on Vercel.
`pnpm install && pnpm dev` there: the Mini App at `/`, the dashboard at `/admin.html`.
Outside Telegram the Mini App runs on demo data, inside Telegram it signs in with `initData`
against this API (`VITE_API_URL`). The dashboard signs in with a one-time code from the bot
(staff only) or a `pnpm dev:token` JWT, and has a demo mode too.
