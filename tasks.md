# OpenSocial Immediate Backend Tasks

This file is the rolling execution slice for the **next implementation pass only**.
Durable planning, historical evidence, and closure state live in `PROGRESS.md`.
Verification cadence and release gates live in `AGENT_TEST_SUITE.md`.

Last refreshed: 2026-03-28

## Active Epic
`EPIC D — Launch Security and Reliability Closure`

## Now
- [ ] `D-02` Record moderation and trust-sensitive operator drill evidence
  - Run and archive moderation drill and trust-sensitive lifecycle operator evidence in staging/prod.
  - Evidence:
    - `pnpm moderation:drill`
    - `pnpm test:backend:ops-pack`

## Next
- [ ] `D-03` Finalize launch smoke matrix and runbook evidence
  - Record explicit pass/fail evidence, rollback points, monitors, and first-24h owner map.
  - Evidence:
    - `pnpm test:backend:ops-pack`
    - runbook artifact references in `PROGRESS.md`

- [ ] Admin maintainability cleanup only if it helps backend operability
  - Keep admin refactor secondary unless it directly improves ops visibility, replay/debug, or verification workflows.

## Notes
- Do not add durable historical status here.
- When a task is completed, move the permanent evidence into `PROGRESS.md` and refresh this file with the next incomplete slice.
