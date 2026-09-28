# English Helper Bot

Telegram bot for tracking daily English reading and vocabulary. See `SPEC.md` for the full product spec.

Current stage: **Stage 1 — Skeleton** (NestJS + TypeORM + Postgres + Telegraf wired up, `/start` smoke test only).

## Prerequisites

- Docker (with `docker compose`)
- For local-only dev without Docker: Node 20+ and pnpm

## Quick start (Docker — recommended)

```bash
cp .env.example .env
# Edit .env and fill in BOT_TOKEN and ADMIN_TELEGRAM_ID at minimum.
docker compose up --build
```

What happens:

1. Postgres 16 starts and becomes healthy.
2. The `bot` container runs pending TypeORM migrations (creates the `groups` table).
3. Nest boots, `nestjs-telegraf` connects via long polling.
4. You should see `Bot started, polling` in the logs.

Then DM the bot in Telegram with `/start` — it replies `Hi, I'm alive`.

Adminer is at http://localhost:8080 (server: `postgres`, user/db from `.env`).

To stop:

```bash
docker compose down            # keeps postgres data
docker compose down -v         # also wipes the postgres volume
```

## Local dev without Docker

```bash
pnpm install
cp .env.example .env           # then point DATABASE_HOST to your local Postgres
pnpm migration:run
pnpm start:dev
```

## Useful scripts

| Command | What it does |
|---|---|
| `pnpm start:dev` | Run with hot reload |
| `pnpm build` | Compile TS to `dist/` |
| `pnpm start:prod` | Run compiled output |
| `pnpm migration:run` | Apply pending migrations |
| `pnpm migration:revert` | Revert the last applied migration |
| `pnpm migration:show` | List migration status |
| `pnpm migration:generate --name=<Name>` | Generate a migration from entity diffs |
| `pnpm migration:create --name=<Name>` | Create an empty migration |
| `pnpm test` | Run unit tests |
| `pnpm lint` | Lint + autofix |

## Environment variables

See `.env.example`. Required: `BOT_TOKEN`, `ADMIN_TELEGRAM_ID`. The rest have sensible defaults for `docker compose`.

## Deploy to Railway

The repo is ready to deploy to [Railway](https://railway.app) (or any other Docker-based PaaS). The `Dockerfile` builds a production image, `docker-entrypoint.sh` runs migrations on startup, and `NODE_ENV=production` flips the entrypoint to `start:prod`.

Steps:

1. **Push the repo to GitHub** (private is fine).
2. **railway.app** → New Project → "Deploy from GitHub repo" → pick the repo. Railway detects `Dockerfile` and `railway.json`, starts building.
3. Inside the project, **Add → Database → PostgreSQL**. Railway provisions one and exposes `DATABASE_URL` as a private variable on the Postgres service.
4. On the **bot service**, set these variables:
   ```
   BOT_TOKEN=<from @BotFather>
   ADMIN_TELEGRAM_ID=<your Telegram numeric ID>
   TZ=Asia/Tashkent
   NODE_ENV=production
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   DATABASE_SSL=true
   ```
   The `${{Postgres.DATABASE_URL}}` is a Railway reference — it auto-fills from the Postgres service. `DATABASE_SSL=true` is required for managed Postgres (TLS).
5. Redeploy. On boot the container will:
   - Run `pnpm migration:run` (idempotent — applies any new migrations).
   - Start the bot with `pnpm start:prod`.
   - Long-poll Telegram. No HTTP port needed.
6. Verify: open Railway logs → look for `Migration ... has been executed successfully` (first deploy only) and `Bot started, polling`. Then DM your bot.

### Environment vars reference

- `DATABASE_URL` (recommended for hosted Postgres) — overrides the individual `DATABASE_HOST/PORT/USER/PASSWORD/NAME` set. Either pattern is supported.
- `DATABASE_SSL=true` — wraps the connection in TLS with `rejectUnauthorized: false`. Required for Railway / Neon / Supabase / Aiven. Leave unset for local docker-compose.
- `NODE_ENV=production` — switches the entrypoint from `start:dev` (hot reload) to `start:prod`. Always set in Railway.

### Why no exposed HTTP port

The bot uses Telegram long polling (`bot.launch()` inside `nestjs-telegraf`). It's an outbound-only connection — nothing inbound is required. Railway will treat the service as healthy as long as the container stays running.

## Build stages

Stages are listed in `SPEC.md` under "Build order". Each stage stops at a checkpoint for manual verification before the next stage starts.
