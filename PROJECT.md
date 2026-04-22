# PROJECT
You are Codex acting as a senior staff engineer and tech lead. Build a polished, locally runnable “Design Desk” web app from scratch.


## Product Summary
OpenSocial is an intent-driven social connection platform where users describe what they want to do or discuss in natural language, and the system routes them to relevant people in real time. The AI layer interprets intent, orchestrates workflows, and enforces safeguards; it never impersonates users in human-to-human chat.

## Goals
- Deliver a production-capable monorepo baseline that can be executed by automated Codex PM/Implementer/Validator pipelines.
- Ship a working API core for auth, profiles, intents, matching, chats, notifications, and moderation with typed contracts.
- Keep deterministic, auditable rails around AI-assisted behavior (policy, prompts, jobs, and event logs).
- Establish reliable local/staging workflows for migrations, seeding, testing, and release checks.

## Non-Goals
- Building full feature-complete mobile/web user clients in the current bootstrap phase.
- Releasing advanced recommendation/personalization and growth loops beyond baseline schema + hooks.
- Optimizing for global scale/perf tuning before core workflows and quality gates are stable.

## Architecture Notes
- Monorepo managed with pnpm workspaces and Turborepo.
- `apps/api` is the primary backend (NestJS modules + BullMQ jobs + WebSocket gateway).
- `prisma/schema.prisma` is the source of truth for relational data; Redis backs queues/realtime coordination.
- Shared packages (`packages/types`, `packages/openai`, `packages/config`, etc.) hold contracts/integration primitives.
- Admin (`apps/admin`) and mobile (`apps/mobile`) are scaffolds; user web app is deferred placeholder.

## Stack and Tooling
- Node.js `>=22`, TypeScript, pnpm, Turborepo
- NestJS (`apps/api`)
- PostgreSQL + Prisma
- Redis + BullMQ
- Socket.IO via NestJS gateway
- OpenAI integration package (`packages/openai`)
- Next.js (admin), Expo React Native (mobile)
- Vitest (API tests), Prettier, Husky

## How to Run / Test
1. Install dependencies: `pnpm install`
2. Start infra services: `pnpm db:up`
3. Generate Prisma client: `pnpm db:generate`
4. Run migrations: `pnpm db:migrate`
5. Seed data (optional): `pnpm db:seed`
6. Start all workspace dev processes: `pnpm dev`
7. Quality checks from root:
   - `pnpm lint`
   - `pnpm typecheck`
   - `pnpm test`

## Definition of Done
A task is done only when all conditions are true:
- Code/config changes are scoped to a single task from `BACKEND_PROGRESS.md`.
- Acceptance criteria in the task description are satisfied.
- Root checks pass (or task explicitly documents why a known placeholder command is expected):
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`
- Any required schema/env/docs updates are included in the same change.
- Validator evidence is captured and PM gate approves completion per `PIPELINE_POLICY.md`.
