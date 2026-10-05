# ThinkRead — Mini App (frontend)

Telegram Mini App for students: React 19 + Vite 7 + TypeScript, TanStack Query, React Router
(hash routing). The UI is the **ThinkRead Design System** (artifact): `src/ui/tokens.css` and
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
`.github/workflows/pages.yml` publishes the demo build to GitHub Pages.

## Layout

```
src/
├── api/        types.ts (API shapes), client.ts (Api interface + HttpApi), mock.ts (MockApi)
├── app/        session.tsx (sign-in, demo switch), hooks.ts (queries, BackButton), Shell.tsx (Screen frame)
├── screens/    Onboarding, NotRegistered, Main, Cards, Dictionary, Word, AddWords, TeacherWords,
│               Reports, SubmitReport, Method, Profile
├── telegram/   webapp.ts — typed wrapper over window.Telegram.WebApp (theme, BackButton, haptics)
├── lib/        dates.ts (ru formatting, Asia/Tashkent), labels.ts (levels, methods, method steps)
└── ui/         tokens.css, components.css, components.tsx, app.css — the design system
```

Rules: every colour / radius / size is a token from `tokens.css`; user-facing text is Russian; the
API is the source of truth for data shapes (`src/api/types.ts` mirrors `me/serializers.ts` in the
backend). Cards (stage 7) run locally on the real queue until the cards API lands.

## Telegram setup

1. Deploy `dist/` over HTTPS; set the same URL as `WEBAPP_URL` in the backend `.env`.
2. In @BotFather: `/newapp` (or Menu Button → Web App URL) pointing to that URL.
3. `CORS_ORIGINS` in the backend must include the Mini App origin.
