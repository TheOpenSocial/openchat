# PIPELINE_POLICY

## Role boundaries

- PM updates planning artifacts (`PROJECT.md`, `PROGRESS.md`, `QUESTIONS.md`).
- Implementer edits product code/config only; it must not update planning artifacts.
- Validator verifies implementation using commands/tests/build evidence.
- PM gate checks completion quality before final task completion.

## Completion policy

- A task is complete only if Validator passes and PM gate passes.
- Failed validation routes to rework.
- Prefer rework on the same fix task; avoid recursive follow-up proliferation.
