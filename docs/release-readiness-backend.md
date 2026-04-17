# Backend Release Readiness Package

This is the backend launch summary for first release windows.

Primary linked evidence:
- `docs/backend-launch-smoke-matrix.md`
- `docs/backend-launch-ops-pack.md`
- `docs/verification-matrix.md`

## Known limits

- Verification lane requires pre-provisioned smoke users/threads and protected tokens.
- Some drills are operationally non-destructive by default (`moderation:drill` defaults to `resolve`).
- Golden Suite local pass is not a substitute for production-lane credentials and canary checks.

## Fallback behavior

- LLM runtime: deterministic fallback remains enabled for timeout/unavailable cases.
- Queue retries: idempotency + dedupe protections remain active for visible side effects.
- Incident verify: fails closed when health/ops endpoints are unavailable.

## Monitoring links / endpoints

- `GET /api/admin/ops/metrics`
- `GET /api/admin/ops/alerts`
- `GET /api/admin/ops/llm-runtime-health`
- `GET /api/admin/ops/agent-workflows`
- `GET /api/admin/ops/agent-reliability`
- `GET /api/admin/ops/verification-runs`

## Kill switches

- `globalKillSwitch`
- `enableNewIntents`
- `enableRealtimeChat`
- `enablePushNotifications`
- `inviteOnlyMode`

Control surface:
- `GET /api/admin/launch-controls`
- `POST /api/admin/launch-controls`

## First 24h incident ownership

- Incident commander: backend on-call
- Runtime / model triage: AI/runtime owner
- Queue + delivery triage: platform/backend owner
- Safety/moderation triage: trust & safety owner

## Required launch commands

```bash
pnpm release:check:api
pnpm test:agentic:suite:verification
pnpm test:backend:ops-pack
```

Run this additionally for release-candidate validation or after regressions that touch benchmark/prod-smoke-sensitive paths:

```bash
pnpm test:agentic:suite -- --layer=full
```

## Ship / no-ship rule

Ship only when all required commands pass, the latest ops-pack artifact status is `passed`, and its `shipVerdict` is `ship_ready`. Treat the `full` layer as a stricter promotion gate for RC/regression-sensitive releases rather than an every-commit default.
