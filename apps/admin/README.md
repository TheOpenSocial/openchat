# OpenSocial Admin (Next.js)

Internal operations console. Runs on port **3001** by default.

Bundling: **Next.js 16** uses **Turbopack** for `next dev` and `next build` by default (not webpack). Use `--webpack` only if you must opt out.

## Setup

```bash
# API must be running (e.g. localhost:3000) with Google OAuth configured
export NEXT_PUBLIC_API_BASE_URL=http://localhost:3000/api
pnpm --filter @opensocial/admin dev
```

## Sign-in

1. Use **Continue with Google**. The API uses `GOOGLE_REDIRECT_URI` (always the **API** callback), then redirects the browser to `{admin origin}/auth/callback?code=…`.
2. **Local dev:** `http://localhost:3001/auth/callback` is allowed by the API without extra env.
3. **Production:** set **`ADMIN_DASHBOARD_REDIRECT_URIS`** on the API to the full callback URL (comma-separated if multiple).
4. The signed-in user id is sent as **`x-admin-user-id`**. **`ADMIN_ALLOWED_USER_IDS`** / **`ADMIN_ROLE_BINDINGS`** still apply.
5. If the API has **`ADMIN_API_KEY`**, enter it on the sign-in screen or in **Overview → Context** (stored in `localStorage` in this browser only).

## Authenticated routes

User-scoped API routes (profiles, agent threads, etc.) receive **`Authorization: Bearer`** from the stored session. The **agent live stream** uses **`EventSource`**, which cannot send headers; the admin app passes **`access_token`** as a query parameter on **`GET /api/agent/threads/:id/stream`** only (see API `AccessTokenGuard`).

## UI stack

- **Tailwind CSS v4** (`@import "tailwindcss"`, `@tailwindcss/postcss`, legacy theme via `@config` in `globals.css`) with **shadcn-style** design tokens (`globals.css` HSL variables, `dark` class on `<html>`).
- Primitives in **`app/components/ui/`** (`Button`, `Input`, `Label`, `Card`, `Badge`, `Separator`, `Alert`) — same patterns as [shadcn/ui](https://ui.shadcn.com).
- **`components.json`** documents paths for optional `npx shadcn@latest add …` usage (aliases point at `@/app/...`).

## Scripts

| Script        | Description              |
| ------------- | ------------------------ |
| `pnpm dev`    | Next dev on `:3001`      |
| `pnpm build`  | Production build         |
| `pnpm start`  | Start production server  |
| `pnpm lint`   | ESLint                   |
| `pnpm typecheck` | TypeScript check      |
