# Backend Launch Ops Pack

This runbook is the backend-first execution path for launch readiness with reproducible evidence.

Companion documents:
- `docs/backend-launch-smoke-matrix.md`
- `docs/release-readiness-backend.md`
- `docs/staging-smoke-checklist.md`

## Goal

Prove the backend is green on release gates, Golden Suite verification, smoke lane checks, and moderation operator drills with machine-readable artifacts.

## Command

```bash
pnpm test:backend:ops-pack
```

Artifact output:
- `.artifacts/backend-ops-pack/<run-id>.json`

Artifact also records:
- runbook file readiness
- per-step env coverage
- final `shipVerdict`
- blocking reasons when the pack fails

## Default steps

1. `pnpm release:check:api`
2. `pnpm test:agentic:suite:verification`
3. `pnpm staging:smoke:verification-lane`
4. `pnpm moderation:drill`
5. `pnpm protocol:recovery:drill`

## Environment

Core verification lane env:
- `AGENTIC_BENCH_ACCESS_TOKEN`
- `AGENTIC_BENCH_USER_ID`
- `AGENTIC_BENCH_THREAD_ID`
- `AGENTIC_VERIFICATION_LANE_ID`
- `SMOKE_BASE_URL`
- `SMOKE_ACCESS_TOKEN`
- `SMOKE_ADMIN_USER_ID`
- `SMOKE_AGENT_THREAD_ID`
- `SMOKE_USER_ID`
- `ONBOARDING_PROBE_TOKEN`

Moderation drill add-ons (for full synthetic drill):
- `MODERATION_DRILL_REPORTER_USER_ID`
- `MODERATION_DRILL_ACCESS_TOKEN`
- `MODERATION_DRILL_TARGET_USER_ID`

## Staging = Prod mode

When staging should temporarily use production-like verification credentials:

```bash
STAGING_EQUALS_PROD=true pnpm test:agentic:suite:verification
```

And for the full pack:

```bash
STAGING_EQUALS_PROD=true BACKEND_OPS_TARGET=staging pnpm test:backend:ops-pack
```

`STAGING_EQUALS_PROD=true` enables fallback lookup from `STAGING_*` keys to `PROD_*`/`PRODUCTION_*` aliases in verification scripts.

## Pass criteria

- `release:check:api` passes.
- `test:agentic:suite:verification` passes with required benchmark + prod-smoke gates.
- moderation drill passes with report -> flag -> assign -> triage -> audit verification.
- protocol recovery drill passes in diagnostic mode by default and can be rerun in active mode with protocol app credentials when you want to verify a representative replay.
- protocol recovery drill now blocks the pack when protocol-relevant queue/auth/request-pressure findings are already `critical`; unrelated moderation criticals remain visible in artifacts but are handled by the moderation drill.
- smoke verification includes the combined admin manual-verification snapshot so request pressure, protocol queue health, protocol auth health, and moderation backlog are readable from one place.
- smoke verification now also probes the direct request-pressure, protocol-queue-health, and protocol-auth-health endpoints so route-level regressions are caught even when the aggregate snapshot still resolves.
- ops-pack artifact status is `passed`.
- ops-pack artifact `shipVerdict` is `ship_ready`.

## Protocol recovery drill

The protocol recovery drill makes delivery and replay verification explicit.

Default behavior:
- inspects `GET /admin/ops/manual-verification`
- inspects `GET /admin/ops/protocol-queue-health`
- writes an artifact under `.artifacts/protocol-recovery-drill/`
- does not perform a replay
- fails the drill if protocol-relevant queue/auth/request-pressure findings are already `critical`

Active replay mode is opt-in:
- set `PROTOCOL_RECOVERY_ALLOW_REPLAY=1`
- provide:
  - `PROTOCOL_RECOVERY_APP_ID`
  - `PROTOCOL_RECOVERY_APP_TOKEN`
- optionally provide:
  - `PROTOCOL_RECOVERY_DELIVERY_ID`

If no explicit delivery id is provided, the drill will use the newest dead-lettered delivery from the admin queue-health snapshot when available.

## Rollback criteria

Immediately block rollout when any of the following occur:
- Golden Suite verification fails.
- duplicate visible side effects in verification artifact.
- reliability snapshot is `critical` with unresolved suspect stages.
- moderation drill cannot complete operator loop.

Rollback action:
1. Redeploy previous production tag.
2. Freeze launches with admin launch controls.
3. Capture artifact + trace ids in incident ticket.
