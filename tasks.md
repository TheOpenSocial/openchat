# OpenSocial Immediate Backend Tasks

This file is the rolling execution slice for the **next implementation pass only**.
Durable planning, historical evidence, and closure state live in `PROGRESS.md`.
Verification cadence and release gates live in `AGENT_TEST_SUITE.md`.

Last refreshed: 2026-03-29

## Active Epic
`Launch Evidence Closure`

## Now
- [ ] Return to launch evidence closure after memory pass
  - Run one fresh deployed `Backend Ops Drill` after the moderation-drill refresh fallback and artifact-upload workflow fixes.
  - Evidence:
    - `pnpm test:backend:ops-pack`
    - uploaded workflow artifacts (`.artifacts/backend-ops-pack/*.json`, `.artifacts/agent-test-suite/*.json`)
  - Status note:
    - all planned long-term memory, activation-readiness, and operator explainability coding slices are now complete and locally green; remaining work is deployed-environment evidence.
    - the latest repo-side blocker fixes are in `scripts/moderation-drill.mjs`, `scripts/run-agent-test-suite.mjs`, `scripts/run-backend-ops-pack.mjs`, and the backend GitHub workflows; rerun live ops evidence after commit/deploy.
    - ops-pack now publishes final verification history into `ops/verification-runs` when live admin env is present, so the next green run should close both artifact and admin-reliability evidence together.

## Next
- [ ] Commit and deploy after live evidence is green
  - Capture the successful ops-drill evidence and then commit/push the completed backend work together.
  - Evidence:
    - green `Backend Ops Drill`
    - `git status`

## Notes
- Do not add durable historical status here.
- When a task is completed, move the permanent evidence into `PROGRESS.md` and refresh this file with the next incomplete slice.
