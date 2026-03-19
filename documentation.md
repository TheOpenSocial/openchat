# OpenSocial Documentation

## What this project is
OpenSocial is an intent-driven social routing platform. Users express what they want to do or discuss in natural language, the backend parses and matches candidates, and accepted requests become human-to-human chats.

## Local setup
Prerequisites:
- Node.js 22+
- pnpm 10+
- Docker

Install dependencies:
```bash
pnpm install
```

Start local infrastructure:
```bash
pnpm db:up
```

Generate Prisma client:
```bash
pnpm db:generate
```

Apply committed migrations:
```bash
pnpm db:migrate
```

Development migration workflow (create a new migration from schema changes):
```bash
pnpm db:migrate:dev
```

Run the monorepo:
```bash
pnpm dev
```

## One-command dev start
```bash
pnpm db:up && pnpm db:generate && pnpm dev
```

## Quality commands
Run formatting check:
```bash
pnpm format:check
```

Run lint:
```bash
pnpm lint
```

Run typecheck:
```bash
pnpm typecheck
```

Run tests:
```bash
pnpm test
```

Run schema validation/drift baseline check:
```bash
pnpm db:drift-check
```

## Deployment pipelines
- Staging deploy workflow: `.github/workflows/deploy-staging.yml`
- Production deploy workflow: `.github/workflows/deploy-production.yml`
- Production rollback workflow: `.github/workflows/rollback-production.yml`
- Supporting scripts: `scripts/deploy-staging.sh`, `scripts/deploy-production.sh`, `scripts/deploy-rollback.sh`

## Export CLI
Status: not implemented yet.

Planned usage example:
```bash
pnpm export --user-id <uuid> --format json
```

## Multiplayer local demo (two tabs, session link)
Status: dedicated user-facing web client flow is not implemented yet (`apps/web` is a placeholder).

Current backend-only demo path:
1. Create two users in the database.
2. Create an intent with sender user ID (`POST /api/intents`).
3. Accept from recipient (`POST /api/inbox/requests/:requestId/accept`).
4. Verify connection/chat creation via `POST /api/connections` and `GET /api/chats/:chatId/messages`.

## Replay mode demo
Status: replay mode is not implemented yet.

## Repository structure
- `apps/api`: NestJS API, queues, realtime gateway, core domain services.
- `apps/admin`: Next.js admin shell.
- `apps/mobile`: Expo mobile shell.
- `apps/web`: deferred user-web placeholder.
- `packages/types`: shared enums, schemas, and queue payload contracts.
- `packages/openai`: OpenAI client wrapper and intent parsing schema.
- `packages/config`: shared app config helpers.
- `packages/ui`: shared UI tokens/primitives.
- `packages/testing`: shared testing constants/helpers.
- `prisma`: schema and seed script.
- `docs`: governance, release, staging smoke, and data retention/archive strategy docs.

## Troubleshooting
1. `DATABASE_URL`/`REDIS_URL` errors:
Set values from `.env.example` and ensure Docker services are running.

2. Prisma client issues after schema updates:
Run `pnpm db:generate`.

3. Redis/BullMQ connection failures:
Ensure `pnpm db:up` succeeded and Redis is reachable at `localhost:6379`.

4. Lint/type errors after dependency changes:
Run `pnpm install` at repo root and rerun `pnpm lint && pnpm typecheck`.
