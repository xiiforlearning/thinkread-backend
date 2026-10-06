---
name: verify
description: Полная проверка ThinkRead перед коммитом или пушем — бэкенд (prettier, eslint, сборка, jest, миграции run/revert/run, дрифт схемы) и фронтенд (prettier, eslint, сборка). Запускать после любых изменений кода и перед тем, как сообщить, что задача готова.
---

# Проверка перед коммитом

Повторяет CI (`.github/workflows/ci.yml`). Всё должно быть зелёным, иначе задача не готова.

## Бэкенд

```bash
pnpm lint:check          # eslint без предупреждений (prettier входит через плагин)
pnpm build               # strict TypeScript
pnpm test                # jest, все спеки
```

Если менялись сущности или миграции (нужен Postgres, см. скилл local-run):

```bash
pnpm migration:run && pnpm migration:revert && pnpm migration:run
pnpm typeorm migration:generate src/infra/db/migrations/CiDrift   # ожидаем «No changes in database schema were found»
rm -f src/infra/db/migrations/*CiDrift*                              # если файл всё же создался — это дрифт, его надо разобрать, а не коммитить
```

Типичные причины дрифта: jsonb default написан с `::jsonb`; enum-колонка без `@Check(enumCheck(...))`;
изменённый enum без ручной перезаписи CHECK в миграции (TypeORM не диффит CHECK).

## Фронтенд

```bash
cd frontend && pnpm format:check && pnpm lint && pnpm build
```

Экранные проверки — скилл `screens`.

## Что ещё посмотреть глазами

- Новый домен или ошибка зарегистрированы в `service-codes.ts` / `error-codes.ts`.
- Тексты для пользователя по-русски и лежат в `messages.ts` модуля; тексты сообщений студентов не логируются.
- `domain/` не импортирует `infra/`.
- Если решение продуктовое (норма, правило, поведение) — оно отражено в CLAUDE.md и, при необходимости, в Notion.
