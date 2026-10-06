---
name: local-run
description: Поднять ThinkRead локально без ключа Anthropic и без Telegram — Postgres, миграции, API на фейковом AI, демо-данные, токены для curl, Mini App в браузере. Использовать, когда нужно запустить проект, проверить эндпоинт руками или показать демо.
---

# Локальный запуск ThinkRead

Всё работает без `ANTHROPIC_API_KEY` (AI подменяется правилами, `AI_MODE=fake`) и без
polling Telegram (`BOT_LAUNCH=false`). Нужны только Node 20+, pnpm 10 и Postgres 16.

## 1. База

```bash
docker compose up -d postgres          # или свой Postgres: user bot / pass bot / db thinkread
cp -n .env.example .env                # заполнить ADMIN_TELEGRAM_ID (любое число), JWT_SECRET (любая строка), BOT_TOKEN (любая строка в формате 123:abc)
pnpm install
pnpm migration:run
pnpm dev:seed                          # демо-данные: 5 групп, 9 студентов, отчёты, словари, список учителя, флаги
```

`pnpm dev:seed --reset` очищает таблицы и сидит заново. Скрипт печатает id демо-студента.

## 2. API

```bash
pnpm dev:api                           # = BOT_LAUNCH=false AI_MODE=fake nest start --watch, Swagger на http://localhost:3000/docs
```

Токены для curl и Swagger (кнопка Authorize → Bearer):

```bash
pnpm dev:token owner                   # OWNER из ADMIN_TELEGRAM_ID
pnpm dev:token teacher 777             # учитель групп Upper 16:00 и IELTS I (из сида)
pnpm dev:token student 11111111-1111-4111-8111-111111111111   # демо-студент Акмаль
```

Быстрая проверка:

```bash
T=$(pnpm -s dev:token owner)
curl -s -H "Authorization: Bearer $T" localhost:3000/admin/overview | head -c 400
S=$(pnpm -s dev:token student 11111111-1111-4111-8111-111111111111)
curl -s -H "Authorization: Bearer $S" -H 'Content-Type: application/json' \
  -d '{"type":"LISTENING","text":"слушал 6 Minute English про сон, 70%, 3 раза. The episode was about why we sleep. слова: drowsy"}' \
  localhost:3000/me/reports
```

Фейковый AI (`src/infra/ai/fake-llm.adapter.ts`) разбирает отчёты регулярками, подбирает
переводы из небольшого словаря, никогда не ставит флаги и задаёт точечный вопрос, если есть
пересказ. С настоящим ключом: `ANTHROPIC_API_KEY=... AI_MODE=anthropic pnpm start:dev`.

## 3. Mini App

```bash
cd frontend && pnpm install && pnpm dev          # http://localhost:5173
```

В браузере (вне Telegram) приложение работает на моках. Чтобы ходить в локальный API из
Telegram, нужен HTTPS-туннель (например `cloudflared tunnel --url http://localhost:5173`),
его адрес в `WEBAPP_URL` бэкенда и `VITE_API_URL` фронта, и `CORS_ORIGINS` с адресом туннеля.

## 4. Проверки перед коммитом

`pnpm verify` (бэкенд: prettier, eslint, сборка, jest) и в `frontend/`: `pnpm format:check && pnpm lint && pnpm build`.
Дрифт схемы: `pnpm typeorm migration:generate src/infra/db/migrations/Check` должен ответить
«No changes in database schema were found» (файл не создаётся).
