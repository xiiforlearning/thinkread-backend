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

## Environment

| Variable | Required | Description |
|---|---|---|
| `BOT_TOKEN` | yes | Telegram bot token |
| `ADMIN_TELEGRAM_ID` | yes | Telegram id of the school owner |
| `DATABASE_URL` or `DATABASE_HOST/PORT/USER/PASSWORD/NAME` | yes | PostgreSQL |
| `DATABASE_SSL` | no | `true` for managed Postgres |
| `ANTHROPIC_API_KEY` | yes | Claude API key (student dialog) |
| `AI_MODEL_DIALOG` | no | Default `claude-haiku-4-5` |
| `AI_MODEL_AUTHENTICITY` | no | Report authenticity check; defaults to `AI_MODEL_DIALOG` |
| `BOT_LAUNCH` | no | `false` boots without Telegram polling |
| `TZ` | no | Default `Asia/Tashkent` |
| `NODE_ENV` | no | `development` / `production` |

`JWT_SECRET` and `WEBAPP_URL` arrive with the API stage.

## AI eval

`pnpm ai:eval` sends the cases in `scripts/ai-eval.cases.json` to the real model and checks which
tool it calls. It spends tokens and needs `ANTHROPIC_API_KEY`; run it after any prompt or tool
change (pass threshold 95%).

## Status

Stages 0–4 of the plan are done: data model, groups and registration, the AI agent, and reports.
A registered student can talk to the bot in free text, hand in reading and listening reports
(the bot asks for whatever the level's method requires), and ask about the weekly norm. Reports
are quietly checked for authenticity; suspicious ones become flags for the teacher. Vocabulary,
cards, reminders, the REST API and the Mini App follow.
