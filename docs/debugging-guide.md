# Debugging Guide

## 1) Start with health and config
- `GET /api/health`
- `GET /api/admin/health` with admin headers
- Verify env vars from `.env.example` (DB, Redis, auth, launch controls)

## 2) Use trace IDs end-to-end
- Every API response includes `x-trace-id`.
- Logs include structured trace fields; search by trace id in API logs.

## 3) Queue debugging path
1. Check queue overview:
   - `GET /api/admin/jobs/queues`
2. Inspect dead letters:
   - `GET /api/admin/jobs/dead-letters`
3. Replay a failed job:
   - `POST /api/admin/jobs/dead-letters/:deadLetterId/replay`
4. Confirm replay effects in `audit_logs` (`queue.job_replayed`).

## 4) Routing/intent debugging
- Inspect intent state and candidate rationale:
  - `GET /api/intents/:intentId/explanations`
  - `GET /api/intents/:intentId/explanations/user`
- Admin view for routing explanation:
  - `GET /api/admin/intents/:intentId/routing-explanations`

## 5) Realtime debugging
- Validate launch controls (`enableRealtimeChat`) before websocket tests.
- Confirm websocket auth/join flow and message fanout events.
- If multi-node, verify Redis adapter config.

## 6) Moderation debugging
- Review moderation queue:
  - `GET /api/admin/moderation/queue`
- Inspect audit events for moderation decisions and notices.

## 7) Database debugging
- Validate schema and migration state:

```bash
pnpm db:migrate:status
pnpm db:drift-check
```

- For local reset-only scenarios (destructive):

```bash
pnpm db:down
pnpm db:up
pnpm db:migrate
pnpm db:seed
```
