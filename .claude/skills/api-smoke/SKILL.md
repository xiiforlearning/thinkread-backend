---
name: api-smoke
description: Живой прогон REST API ThinkRead curl-ом на поднятом локально приложении — вход, /me/* от имени студента, /admin/* от имени владельца и учителя, проверка прав. Использовать после изменений в infra/api или доменных сервисах, которые они вызывают.
---

# Смоук REST API

Нужно поднятое приложение (скилл `local-run`): `pnpm dev:api` и сид `pnpm dev:seed`.

```bash
OWNER=$(pnpm -s dev:token owner)
TEACHER=$(pnpm -s dev:token teacher 777)
STUDENT=$(pnpm -s dev:token student 11111111-1111-4111-8111-111111111111)
H() { echo "Authorization: Bearer $1"; }
J='Content-Type: application/json'
B=http://localhost:3000
```

## Студент (`/me/*`)

```bash
curl -s -H "$(H $STUDENT)" $B/me | head -c 300
curl -s -H "$(H $STUDENT)" $B/me/progress
curl -s -H "$(H $STUDENT)" "$B/me/words?status=LEARNING&limit=5"
curl -s -H "$(H $STUDENT)" $B/me/recommendations | head -c 300
curl -s -H "$(H $STUDENT)" $B/me/reports/today
# отчёт: аудирование без пересказа → CLARIFY, потом ответ → SAVED
curl -s -H "$(H $STUDENT)" -H "$J" -d '{"type":"LISTENING","text":"слушал 6 Minute English про сон, 70%, 3 раза, слова: drowsy"}' $B/me/reports
curl -s -H "$(H $STUDENT)" -H "$J" -d '{"text":"The episode was about why we sleep. The hosts said a nap helps memory."}' $B/me/reports/<draftId>/clarify
# второй отчёт того же типа в тот же день → 409, код ...260 (DAILY_LIMIT)
```

## Владелец (`/admin/*`)

```bash
for ep in overview students flags groups membership-checks word-lists settings staff ai-usage; do
  printf "%-20s" $ep; curl -s -o /dev/null -w "%{http_code}\n" -H "$(H $OWNER)" $B/admin/$ep; done
curl -s -X PATCH -H "$(H $OWNER)" -H "$J" -d '{"values":{"norms.readingPerWeek":4}}' $B/admin/settings | head -c 200
curl -s -X DELETE -H "$(H $OWNER)" $B/admin/settings/norms.readingPerWeek | head -c 100
```

## Права учителя

Учитель 777 видит только Upper 16:00 и IELTS I. Ожидаемые коды:

| Запрос | Код |
|---|---|
| `GET /admin/students` учителем | 200, только студенты его групп |
| `GET /admin/settings`, `/admin/staff` учителем | 403 |
| `PATCH /admin/students/:id` учителем | 403 |
| `POST /admin/word-lists` scope ALL учителем | 403 |
| любой `/admin/*` без токена | 401 |

## Что считать ошибкой

Любой 500; `{ error }` без кода формата `{level}{service}{error}`; ответ не в `{ data }`;
отчёт, сохранённый дважды за день; учитель, увидевший чужую группу.
