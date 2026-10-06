---
name: screens
description: Проверить экраны Mini App и дашборда ThinkRead глазами — собрать фронт, снять скриншоты всех экранов в светлой и тёмной теме через Playwright (390×844 для Mini App, 1280×800 для дашборда) и сравнить с артбордами дизайна. Использовать после любых изменений в frontend/src.
---

# Экраны Mini App и дашборда

Экраны должны один в один повторять артборды «ThinkRead — кликабельный дизайн»
(https://claude.ai/artifact/GTWaTTfrxZ6QWE1Pho2fZs) и собираться только из компонентов
дизайн-системы (`frontend/src/ui/components.tsx`, токены в `tokens.css`).

## Снять скриншоты

```bash
cd frontend && pnpm build && pnpm preview --port 4173 --host 127.0.0.1 &
node .claude/skills/screens/shoot.cjs          # Mini App, 390×844; из корня репозитория; нужен playwright-core (npm i -g playwright-core или NODE_PATH на установку в scratchpad)
node .claude/skills/screens/shoot-admin.cjs    # дашборд (admin.html?demo=1), 1280×800: login, overview, students, flags, groups, settings
```

Скрипт обходит маршруты `#/`, `#/cards`, `#/words`, `#/words/add`, `#/words/teacher`,
`#/reports`, `#/reports/new`, `#/reports/method`, `#/profile`, плюс `?demo=pending` и
`?demo=not_member`, в светлой и тёмной теме, и складывает PNG в `frontend/.screens/`
(папка в .gitignore). Chromium берётся из `PLAYWRIGHT_BROWSERS_PATH` или `/opt/pw-browsers`.

## На что смотреть

- Ничего не вылезает за край карточки на ширине 390 (особенно ряд «поле + кнопка» — для него есть класс `tr-field-row`).
- Таб-бар и нижняя кнопка (`MainButton`) не перекрывают контент; в Telegram учтён `safe-area-inset-bottom`.
- Тёмная тема: нет «белых дыр» — все цвета через токены, без хардкода.
- Текст по-русски, даты через `lib/dates.ts` (Asia/Tashkent), склонения через `plural()`.
- В консоли нет ошибок страницы (скрипт печатает `pageerror`).

## Демо-режим

Вне Telegram приложение само переключается на `MockApi` (`src/api/mock.ts`) — данные
артбордов. Если экран требует новых данных, сначала добавьте их в мок, чтобы демо не
разъехалось с дизайном.
