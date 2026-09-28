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
| `TZ` | no | Default `Asia/Tashkent` |
| `NODE_ENV` | no | `development` / `production` |

More variables (`ANTHROPIC_API_KEY`, `JWT_SECRET`, `WEBAPP_URL`) arrive with the AI and API stages.

## Status

Stage 1 of the plan: clean skeleton and the new data model with a baseline migration. The bot
currently answers every private message with an "under construction" note.
