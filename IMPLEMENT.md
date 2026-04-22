Now implement the entire project end-to-end.

Non-negotiable constraint

Do not stop after a milestone to ask me questions or wait for confirmation.
Proceed through every milestone in BACKEND_PROGRESS.md until the whole project is complete and fully validated.
Execution rules (follow strictly)

Treat BACKEND_PROGRESS.md as the source of truth. If anything is ambiguous, make a reasonable decision and record it in BACKEND_PROGRESS.md before coding.

Implement deliberately with small, reviewable commits. Avoid bundling unrelated changes.

After every milestone:

run verification commands (lint, typecheck, unit tests, snapshots, and any integration checks)
fix all failures immediately
add or update tests that cover the milestone’s core behavior
commit with a clear message that references the milestone name
If a bug is discovered at any point:

write a failing test that reproduces it
fix the bug
confirm the test now passes
record a short note in BACKEND_PROGRESS.md under “Implementation Notes”
Validation requirements

Maintain a “verification checklist” section in BACKEND_PROGRESS.md that stays accurate as the repo evolves.
Determinism is required for serialization, ops journaling, replay, and export codegen. Enforce with snapshot tests and stable ordering.
Documentation requirements

Create documentation.md and keep it concise and useful. Update it as you implement so it matches reality.

At the end, ensure documentation.md includes:

what the project is
local setup and one-command dev start
how to run tests, lint, typecheck
how to run the export CLI with examples
how to demo multiplayer locally (two tabs, session link)
how to demo replay mode
repo structure overview
troubleshooting section (top issues and fixes)
Completion criteria (do not stop until all are true)

All milestones in BACKEND_PROGRESS.md are implemented and checked off.
npm run dev works 
npm test, npm run lint, and npm run typecheck all pass.
documentation.md is accurate and complete.
