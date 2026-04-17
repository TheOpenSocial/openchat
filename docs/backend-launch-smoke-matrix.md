# Backend Launch Smoke Matrix

This matrix is the backend launch go/no-go checklist for OpenSocial.

Use it together with:
- `docs/backend-launch-ops-pack.md`
- `docs/release-readiness-backend.md`
- `docs/staging-smoke-checklist.md`
- `docs/verification-matrix.md`

## Goal

Make launch evidence explicit, repeatable, and machine-linked.

The backend is launch-ready only when:
- release gates are green
- the Golden Suite verification lane is green in a deployed environment
- moderation/trust drill evidence exists
- the latest ops-pack artifact status is `passed`

## Matrix

| Area | Command / Endpoint | Expected outcome | Evidence |
| --- | --- | --- | --- |
| Release baseline | `pnpm release:check:api` | Green | console output + latest CI/deploy run |
| Golden Suite verification | `pnpm test:agentic:suite:verification` | Green in deployed env | `.artifacts/agent-test-suite/verification-latest.json` |
| Verification smoke lane | `pnpm staging:smoke:verification-lane` | Green against reserved verification lane | smoke artifact emitted by lane script |
| Backend ops pack | `pnpm test:backend:ops-pack` | Final status `passed` | `.artifacts/backend-ops-pack/<run-id>.json` |
| Runtime health | `GET /api/admin/ops/llm-runtime-health` | No critical runtime snapshot | admin endpoint snapshot |
| Reliability snapshot | `GET /api/admin/ops/agent-reliability` | No unexplained critical failure class | admin endpoint snapshot |
| Workflow replayability | `GET /api/admin/ops/agent-workflows` | Recent runs explainable, replayability populated | admin endpoint snapshot |
| Launch controls | `GET /api/admin/launch-controls` | Kill switches and rollout flags readable | admin endpoint snapshot |
| Moderation operator loop | `pnpm moderation:drill` | Report -> queue -> assignment -> triage -> audit succeeds | moderation drill output + latest artifact/log |
| Incident readiness | `pnpm staging:verify:incident` | Health/alerts/runbook checks pass | incident verification output |

## First 24h Owner Map

| Area | Primary owner | Backup owner |
| --- | --- | --- |
| Backend incident command | backend on-call | engineering lead |
| Agent/runtime/model triage | AI/runtime owner | backend on-call |
| Queue/delivery/replay | platform/backend owner | backend on-call |
| Moderation/trust actions | trust & safety owner | backend on-call |
| Rollback decision | engineering lead | backend on-call |

## Rollback triggers

Do not continue rollout if any of the following occur:
- verification lane fails
- duplicate visible side effects are detected
- moderation drill cannot complete
- reliability snapshot is `critical` without an explained mitigation
- launch controls do not respond

## Notes

- Keep this document operational, not aspirational.
- If a command or endpoint is replaced, update this matrix and the ops-pack script in the same change.

## Evidence Log Template

Capture the final go/no-go evidence in this shape:

| Date | Area | Command / Run | Result | Artifact / URL | Notes |
| --- | --- | --- | --- | --- | --- |
| YYYY-MM-DD | Golden Suite verification | `pnpm test:agentic:suite:verification` or workflow run id | passed / failed | artifact path or workflow URL | short note |
| YYYY-MM-DD | Backend ops pack | `pnpm test:backend:ops-pack` or workflow run id | passed / failed | artifact path or workflow URL | short note |
| YYYY-MM-DD | Moderation drill | `pnpm moderation:drill` or workflow run id | passed / failed | artifact path or workflow URL | short note |
