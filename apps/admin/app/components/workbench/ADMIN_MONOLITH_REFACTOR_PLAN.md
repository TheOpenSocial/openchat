# Admin Workbench Refactor Plan

Status: active  
Scope: structural extraction only, no behavior or endpoint changes

## Goals
- Reduce `apps/admin/app/page.tsx` by moving tab-specific orchestration into focused hooks/services.
- Keep current UX and API calls identical while improving maintainability.
- Make each extraction verifiable with existing tests and a quick manual smoke.

## Ordered extraction slices
1. Session/auth lifecycle hook
- Move session hydration, refresh callbacks, and auth-failure handling from `page.tsx` into `useAdminSessionLifecycle`.
- Done when sign-in/out and token refresh behavior match current behavior.

2. Ops snapshots hook
- Move health/dead-letter/outbox/onboarding-runtime snapshot loaders into `useOpsSnapshotsActions`.
- Done when all current Workbench actions are still wired and tab buttons trigger same API routes.

3. Entity inspector hook family
- Split user/intent/chat/admin actions into separate hooks with explicit typed inputs/outputs.
- Done when `WorkbenchContent` props are reduced and all command actions keep parity.

4. Agent debug + stream orchestration module
- Extract stream lifecycle + debug request history control into dedicated modules.
- Done when stream connect/disconnect and debug history retention limits remain unchanged.

5. Tab panel composition layer
- Move large tab JSX blocks from `WorkbenchContent` into per-tab panel components.
- Done when each tab can be edited independently and no visual regressions are introduced.

## Guardrails
- No endpoint contract changes.
- No visual restyling in this track.
- Keep accessibility labels and keyboard behavior untouched.
- Each slice should be mergeable independently with passing tests.

## Evidence commands
- `pnpm --filter @opensocial/admin typecheck`
- `pnpm --filter @opensocial/admin lint`
- `pnpm --filter @opensocial/admin test`

