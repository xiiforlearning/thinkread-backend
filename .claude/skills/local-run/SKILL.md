---
name: local-run
description: Поднять ThinkRead локально — Postgres, миграции, API на локальном Claude (AI_MODE=claude-cli) или на заглушке, демо-данные, токены для curl, Mini App в браузере и в настоящем Telegram через бота из BotFather и HTTPS-туннель. Использовать, когда нужно запустить проект, проверить эндпоинт руками или показать демо.
---

# Локальный запуск ThinkRead

Ключ Anthropic не нужен: `AI_MODE=claude-cli` гоняет все AI-скиллы через установленный и
залогиненный Claude Code (`claude -p --json-schema`), `AI_MODE=fake` — через заглушку на
правилах. Нужны Node 20+, pnpm 10, Postgres 16; для показа в Telegram — токен бота из
@BotFather и HTTPS-туннель.

## 0. AI без ключа

```bash
claude login                                  # один раз, если ещё не залогинен
AI_MODE=claude-cli pnpm ai:skill              # список скиллов продукта
AI_MODE=claude-cli pnpm ai:skill parse_listening_report "слушал 6 Minute English, 70%, 3 раза. The episode was about sleep."
```

Скиллы (`src/domain/ai/skills.ts`): parse_reading_report, parse_listening_report, enrich_words,
authenticity, spot_check_grade, sentence_check. Каждый = промпт + принудительный инструмент +
симулятор; `pnpm ai:skill` печатает ответ модели (или симулятора) для текста.

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
AI_MODE=claude-cli pnpm dev:api        # = BOT_LAUNCH=false nest start --watch, Swagger на http://localhost:3000/docs (без AI_MODE — заглушка)
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

## 3. Mini App в браузере

```bash
cd frontend && pnpm install && pnpm dev          # http://localhost:5173
```

В браузере (вне Telegram) приложение работает на моках — этого хватает для экранов.

## 4. Показ в настоящем Telegram

1. @BotFather → `/newbot` → токен в `BOT_TOKEN`; `ADMIN_TELEGRAM_ID` = ваш Telegram id (владелец).
2. Два HTTPS-туннеля (например cloudflared): `cloudflared tunnel --url http://localhost:3000`
   (API) и `cloudflared tunnel --url http://localhost:5173` (Mini App). ngrok тоже подходит.
3. Бэкенд `.env`: `BOT_LAUNCH=true`, `AI_MODE=claude-cli`, `WEBAPP_URL=<туннель 5173>`,
   `CORS_ORIGINS=<туннель 5173>`. Фронт `frontend/.env`: `VITE_API_URL=<туннель 3000>`.
4. `pnpm start:dev` (polling включён) и `cd frontend && pnpm dev --host`.
5. @BotFather → `/newapp` (или `/setmenubutton`) с адресом туннеля 5173. Открыть бота, нажать
   «Открыть ThinkRead»: вход по initData, регистрация имени, отчёты через локальный Claude.
6. Чтобы стать студентом, добавьте бота в тестовую группу Telegram и вступите в неё сами;
   владелец задаёт уровень группы через `PATCH /admin/groups/:chatId` или в дашборде.

Токен бота живёт только в `.env` (в gitignore); после демо его можно перевыпустить в BotFather.

## 5. Проверки перед коммитом

`pnpm verify` (бэкенд: prettier, eslint, сборка, jest) и в `frontend/`: `pnpm format:check && pnpm lint && pnpm build`.
Дрифт схемы: `pnpm typeorm migration:generate src/infra/db/migrations/Check` должен ответить
«No changes in database schema were found» (файл не создаётся).
