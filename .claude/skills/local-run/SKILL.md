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

Если `claude-cli` отвечает ошибкой (`AppError 310`, `claude-cli: …`), текст ошибки говорит что
делать. Диагностика по шагам:

```bash
claude --version                      # нужен Claude Code 2.1+ (флаги --bare и --json-schema); иначе claude update
claude auth status                    # loggedIn: true; иначе claude login
echo hi | claude -p --bare --output-format json --tools "" --model haiku   # сырой вызов: должен вернуть {"is_error":false,"result":"…"}
AI_MODE=claude-cli pnpm ai:skill sentence_check                         # тот же вызов через адаптер
```

Частые причины: не выполнен `claude login` на этой машине; старый Claude Code; `claude` не в
PATH процесса, из которого запущен API (задать `CLAUDE_CLI_PATH=/полный/путь/claude`; на
Windows — путь к `claude.exe` нативной сборки, `claude install`). Пустой `ANTHROPIC_API_KEY=`
в `.env` не мешает: адаптер убирает его из окружения CLI. Модель: по умолчанию алиас
`haiku`, переопределяется `CLAUDE_CLI_MODEL`.

Скиллы (`src/domain/ai/skills.ts`): parse_reading_report, parse_listening_report, enrich_words,
authenticity, spot_check_grade, sentence_check, teacher_chat, parent_report. Каждый = промпт + принудительный инструмент +
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

Дашборд владельца: `http://localhost:5173/admin.html`. Вход для локальной работы — «Войти по
токену разработчика» с токеном из `pnpm dev:token owner` (нужен `VITE_API_URL` в
`frontend/.env`); кнопка Telegram появляется при `VITE_BOT_USERNAME` и `/setdomain` у бота;
`?demo=1` — демо на данных макета без сервера.

## 4. Показ в настоящем Telegram

1. @BotFather → `/newbot` → токен в `BOT_TOKEN`; `ADMIN_TELEGRAM_ID` = ваш Telegram id (владелец).
2. Фронт уже опубликован на GitHub Pages (`pages.yml`): `https://<owner>.github.io/<repo>/`,
   дашборд — `…/admin.html`. Нужен только один HTTPS-туннель до API:
   `cloudflared tunnel --url http://localhost:3000` (ngrok тоже подходит). Альтернатива —
   второй туннель до `pnpm dev --host` (5173), если хочется править фронт на лету.
3. Бэкенд `.env`: `BOT_LAUNCH=true`, `AI_MODE=claude-cli`,
   `WEBAPP_URL=https://<owner>.github.io/<repo>/?api=<туннель 3000>`,
   `CORS_ORIGINS=https://<owner>.github.io`. Параметр `?api=` говорит фронту, где API; он
   запоминается в браузере, а при новом адресе туннеля меняется там же. Постоянный адрес можно
   зашить в сборку переменной репозитория `API_URL` (Settings → Variables) и перезапустить
   `pages.yml`; `BOT_USERNAME` там же включает кнопку входа Telegram в дашборде.
4. `pnpm start:dev` (polling включён).
5. @BotFather → `/newapp` (или `/setmenubutton`) с тем же адресом, что в `WEBAPP_URL`;
   для дашборда `/setdomain` → `<owner>.github.io`. Открыть бота, нажать «Открыть ThinkRead»:
   вход по initData, регистрация имени, отчёты через локальный Claude.
6. Чтобы стать студентом, добавьте бота в тестовую группу Telegram и вступите в неё сами;
   владелец задаёт уровень группы через `PATCH /admin/groups/:chatId` или в дашборде.
7. Рассылки руками (владелец, дашборд → Настройки → «Рассылки» или curl):
   `POST /admin/reminders/run {"kind":"CARDS"|"REPORTS"}` — напоминания в личку студентам,
   `POST /admin/weekly-summary/run` — сводка недели владельцу и учителям + флаги
   NORM_MISSED_WEEK. По расписанию: карточки в `reminders.cardsTime`, отчёты по чт/сб в
   `reminders.reportsTime`, сводка в понедельник 09:00 (Asia/Tashkent).

Токен бота живёт только в `.env` (в gitignore); после демо его можно перевыпустить в BotFather.

## 5. Проверки перед коммитом

`pnpm verify` (бэкенд: prettier, eslint, сборка, jest) и в `frontend/`: `pnpm format:check && pnpm lint && pnpm build`.
Дрифт схемы: `pnpm typeorm migration:generate src/infra/db/migrations/Check` должен ответить
«No changes in database schema were found» (файл не создаётся).
