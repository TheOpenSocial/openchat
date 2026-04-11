# OpenSocial Immediate Backend Tasks

This file is the rolling execution slice for the **next implementation pass only**.
Durable planning, historical evidence, and closure state live in `BACKEND_PROGRESS.md`.
Verification cadence and release gates live in `AGENT_TEST_SUITE.md`.

Last refreshed: 2026-04-09

## Active Epic
`No Active Backend Slice`

## Now
- [x] Align admin authentication model across API, dashboard, and docs
- [x] Add missing admin API mutations for scheduled-task and launch-control operations
- [x] Harden backend security posture enforcement and visibility
- [x] Improve operator drill and verification ingestion ergonomics
- [x] Expand admin-facing explainability for reliability and workflow failures

## Next
- [x] Choose and complete a follow-on operator explainability slice
  - Added explainability summaries to `ops/agent-outcomes` and
    `ops/agent-actions`.

- [ ] Start a new backend slice only after a fresh prioritization pass.

## Notes
- Verification completed on 2026-04-09:
  - `pnpm --filter @opensocial/api exec vitest run test/launch-controls.service.spec.ts test/scheduled-tasks.service.spec.ts test/security-posture.spec.ts test/admin-security.middleware.spec.ts`
  - `pnpm --filter @opensocial/api exec tsc --noEmit`
  - `pnpm --filter @opensocial/api exec vitest run test/admin.controller.spec.ts`
  - `node --test scripts/run-backend-ops-pack.test.mjs scripts/moderation-drill.test.mjs`
  - `pnpm --filter @opensocial/api lint`
  - follow-on slice:
    `pnpm --filter @opensocial/api exec vitest run test/admin.controller.spec.ts`
    `pnpm --filter @opensocial/api exec tsc --noEmit`
- Audit snapshot from 2026-04-09:
  - admin backend coverage is broader than the current task list reflects
  - the prior admin auth/docs drift around `ADMIN_API_KEY` is now closed
  - scheduled-task admin support now includes operator mutations in addition to
    inspection
  - launch controls, security posture, verification runs, and reliability
    surfaces now have first-class backend coverage for the completed slice
- Do not add durable historical status here.
- When a task is completed, move the permanent evidence into `BACKEND_PROGRESS.md` and refresh this file with the next incomplete slice.
