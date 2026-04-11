# Bootstrap Routine

Use this file at the start of every agent session.

## 1. Load Context
Run from repo root:

```bash
pwd
rg --files -g '*.md' | sort
```

Read markdown context in this order:
1. `README.md`
2. `BACKEND_PROGRESS.md`
3. Every remaining `*.md` file from `rg --files -g '*.md' | sort`

Minimum read depth:
- For `BACKEND_PROGRESS.md`: read fully.
- For other docs: read headings first, then open full sections needed for the active milestone.

## 2. Resume Implementation From BACKEND_PROGRESS
Treat `BACKEND_PROGRESS.md` as source of truth.

Select the next actionable work item:
```bash
awk '/^- \[( |~)\]/{print NR ":" $0; exit}' BACKEND_PROGRESS.md
```

Execution loop:
1. Implement the selected milestone in code.
2. Add or update tests for the behavior.
3. Run verification commands:
   - `pnpm format:check`
   - `pnpm lint`
   - `pnpm typecheck`
   - `pnpm test`
   - `pnpm db:drift-check`
4. Fix failures immediately.
5. Update `BACKEND_PROGRESS.md` checkboxes and add a dated note under `Implementation Notes`.
6. Move to the next unchecked/in-progress milestone and repeat.

## 3. Guardrails
- Do not revert unrelated user changes.
- Prefer small, reviewable commits.
- Keep `documentation.md` aligned with actual implementation.
- If a decision is ambiguous, make a reasonable choice and record it in `BACKEND_PROGRESS.md` before coding.
