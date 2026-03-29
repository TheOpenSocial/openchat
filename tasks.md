# OpenSocial Immediate Backend Tasks

This file is the rolling execution slice for the **next implementation pass only**.
Durable planning, historical evidence, and closure state live in `PROGRESS.md`.
Verification cadence and release gates live in `AGENT_TEST_SUITE.md`.

Last refreshed: 2026-03-29

## Active Epic
`Backend Product Quality Iteration`

## Now
- [ ] Deepen real-world activation quality
  - Tighten first-value usefulness after onboarding completion.
  - Focus:
    - better first recommendation quality
    - clearer first-thread / first-intent prioritization
    - stronger resume behavior after partial activation
  - Evidence:
    - focused onboarding/backend tests
    - `pnpm test:agentic:suite -- --layer=workflow`

- [ ] Improve agent outcome usefulness under real no-match and follow-up conditions
  - Focus:
    - more useful async follow-ups
    - better no-match recovery guidance
    - stronger next-action prioritization
  - Evidence:
    - focused intent/follow-up tests
    - `pnpm test:agentic:suite -- --layer=scenario`

- [ ] Deepen long-term memory extraction and retrieval quality
  - Focus:
    - richer structured extraction from conversations
    - stronger contradiction resolution and stale-memory suppression
    - better operator-facing explainability for disputed memories
  - Evidence:
    - focused personalization/admin tests
    - `pnpm test:agentic:suite -- --layer=eval`

## Next
- [ ] Run operator drills on representative real cases
  - Use the deployed admin/debug surfaces on real moderation and memory cases.
  - Evidence:
    - green `Backend Ops Drill`
    - archived drill artifacts and admin inspection notes

## Notes
- Do not add durable historical status here.
- When a task is completed, move the permanent evidence into `PROGRESS.md` and refresh this file with the next incomplete slice.
