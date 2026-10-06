# ThinkRead — Mini App and dashboard (frontend)

Two pages in one Vite project: the students' Telegram Mini App (`index.html`) and the owner's /
teachers' web dashboard (`admin.html`). React 19 + Vite 7 + TypeScript, TanStack Query, React
Router (hash routing). The UI is the **ThinkRead Design System** (artifact): `src/ui/tokens.css` and
`src/ui/components.css` are copied from it verbatim, `src/ui/components.tsx` is the React port of
its component bundle. Screens follow the artboards of «ThinkRead — кликабельный дизайн».

## Run

```bash
cd frontend
pnpm install
cp .env.example .env        # VITE_API_URL, VITE_DEMO
pnpm dev                    # http://localhost:5173
```

- **Inside Telegram** the app signs in with `initData` (`POST /auth/webapp`) and talks to the
  backend at `VITE_API_URL`.
- **Outside Telegram** (a browser, `VITE_DEMO=1`) it runs on in-memory demo data (`src/api/mock.ts`)
  with the same API contract — nothing to deploy to show the UI. `?demo=pending` shows the first
  login (name form), `?demo=not_member` the "no access" screen.

`pnpm build` → `dist/` (static, relative paths — any static host works; `base: './'`).
`.github/workflows/pages.yml` publishes the build to GitHub Pages — the public HTTPS address
Telegram needs (`https://<owner>.github.io/<repo>/`, the dashboard at `…/admin.html`). The API
address is `VITE_API_URL` at build time (repository variable `API_URL`) or, at run time,
`?api=https://…` in the page URL (remembered in localStorage; `?api=` forgets it) — so the Pages
build can point at a local backend behind a cloudflared / ngrok tunnel. Outside Telegram the Mini
App still runs on demo data; the dashboard has its demo buttons.

## Dashboard (`admin.html`)

`http://localhost:5173/admin.html` — the web dashboard for Рустам and the teachers, on the same
design system and the `/admin/*` API (`src/admin/api.ts` mirrors `admin/serializers.ts`).

- **Sign-in**: the Telegram Login Widget (`VITE_BOT_USERNAME`, the bot needs `/setdomain` in
  @BotFather) → `POST /auth/telegram-login`; only OWNER / TEACHER get a JWT (kept in
  localStorage). For local work paste a token from `pnpm dev:token owner` into «Войти по токену
  разработчика». **Demo**: the «Демо» buttons, `?demo=1` or `VITE_DEMO=1` run `MockAdminApi`
  (`src/admin/mock.ts`) — the school of the artboards, no backend.
- **Screens** (`src/admin/screens/`): Overview (norm rates, health by group, 8-week chart, top
  readers, attention list), Students (list pane + card: rename / archive / recheck, quiet flags,
  calendar, reports feed, vocabulary, AI chat), Flags (inbox + flagged report vs previous ones,
  «проверено» / «ложная тревога»), Groups (levels, membership checks, teacher word lists),
  Settings (owner: norms, reminders, health thresholds, staff, AI spend).
- The teacher's AI chat (`POST /admin/students/:id/chat`, history kept in memory) and the parents'
  report (`…/parent-report`) answer from facts the backend computes; the demo answers from the mock.
  Settings → «Рассылки» runs the reminders and the weekly summary on demand (owner).
- Teachers see only their groups (the API scopes everything); the Settings page is owner-only.

## Layout

```
src/
├── api/        types.ts (API shapes), client.ts (Api interface + HttpApi), mock.ts (MockApi)
├── admin/      the dashboard: api.ts (AdminApi + HttpAdminApi), mock.ts, session.tsx, Shell.tsx,
│               Login.tsx, format.ts, screens/{Overview,Students,Flags,Groups,Settings}.tsx
├── app/        session.tsx (sign-in, demo switch), hooks.ts (queries, BackButton), Shell.tsx (Screen frame)
├── screens/    Onboarding, NotRegistered, Main, Cards, Dictionary, Word, AddWords, TeacherWords,
│               Reports, SubmitReport, Method, Profile
├── telegram/   webapp.ts — typed wrapper over window.Telegram.WebApp (theme, BackButton, haptics)
├── lib/        dates.ts (ru formatting, Asia/Tashkent), labels.ts (levels, methods, method steps)
└── ui/         tokens.css, components.css, components.tsx, app.css, admin.css — the design system
```

Rules: every colour / radius / size is a token from `tokens.css`; user-facing text is Russian; the
API is the source of truth for data shapes (`src/api/types.ts` mirrors `me/serializers.ts` in the
backend). Cards go through `/me/cards` (one attempt at a time; the mock reproduces the same rules).

## Telegram setup

1. Deploy `dist/` over HTTPS; set the same URL as `WEBAPP_URL` in the backend `.env`.
2. In @BotFather: `/newapp` (or Menu Button → Web App URL) pointing to that URL.
3. `CORS_ORIGINS` in the backend must include the Mini App origin.
