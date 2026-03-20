# Local Setup Guide

## Prerequisites
- Node.js 22+
- pnpm 10+
- Docker Desktop

## Setup
1. Install dependencies.

```bash
pnpm install
```

2. Start local services.

```bash
pnpm db:up
```

3. Generate Prisma client.

```bash
pnpm db:generate
```

4. Apply migrations.

```bash
pnpm db:migrate
```

5. Seed local data (optional but recommended).

```bash
pnpm db:seed
```

6. Start all apps/services.

```bash
pnpm dev
```

## Verification
Run from repo root:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm db:drift-check
```

**Web UI automation (no backend):** after `pnpm --filter @opensocial/web test:e2e:install` once:

```bash
pnpm --filter @opensocial/web test:e2e
```

See `docs/frontend-critical-path.md` for Maestro + Playwright details.

## URLs
- API health: `http://localhost:3000/api/health`
- Admin app: default Next.js dev port for `apps/admin`
- Mobile: run with `pnpm --filter @opensocial/mobile dev`
- Web: `pnpm --filter @opensocial/web dev` (port `3002` by default)

## UI design preview (no backend)

- **Mobile:** `EXPO_PUBLIC_DESIGN_MOCK=1 pnpm --filter @opensocial/mobile dev` — full tabbed shell with mock home (agent chat), chats, and profile data.
- **Web:** `NEXT_PUBLIC_DESIGN_MOCK=1 pnpm --filter @opensocial/web dev` — same idea in the browser (welcome → preview sign-in → onboarding → home).
