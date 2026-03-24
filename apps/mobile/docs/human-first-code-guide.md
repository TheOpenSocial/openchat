# OpenSocial Mobile: Human-First Code Guide

This guide defines the baseline quality bar for `apps/mobile`:

- readable by humans first
- strict separation of concerns
- deterministic side-effects
- consistent formatting and lint hygiene

## 1. Non-Negotiable Gates

Before pushing mobile changes, run:

```bash
pnpm prettier --write apps/mobile/src
pnpm -C apps/mobile lint
pnpm -C apps/mobile typecheck
```

No exceptions for "small" changes.

## 2. File-Level Architecture

Prefer this layering:

- `src/screens/*`: composition/orchestration only
- `src/screens/**/hooks/*`: feature orchestration + side-effect flows
- `src/screens/**/domain/*`: pure domain logic, mapping, selectors, state models
- `src/components/*` and `src/open-chat/*`: presentation-first UI, callback-driven
- `src/store/*`: minimal global state with narrow write APIs

Rule: if logic can be pure, it belongs in `domain/*`, not inside JSX files.

## 3. Hook Ordering and Block Separation

Within a component, keep this order:

1. props / early guard values
2. store selectors
3. refs
4. derived values (`useMemo`)
5. handlers (`useCallback`)
6. side-effects (`useEffect`)
7. render

Use blank lines between conceptual blocks. Do not collapse unrelated statements.

Bad:

```ts
const runtime = useThreadRuntimePresentation({ onRuntimeTelemetry, rawRuntime });
const phase = runtime.phase;
```

Good:

```ts
const runtime = useThreadRuntimePresentation({
  onRuntimeTelemetry,
  rawRuntime,
});

const phase = runtime.phase;
```

## 4. Side-Effect Discipline

Avoid effect chains inside screens.

If a screen has more than one non-trivial `useEffect`, extract:

- `useXHydration`
- `useXRecoveryController`
- `useXRealtime`
- `useXMessagingController`

Each hook should own one workflow family.

## 5. View Model Contract

UI components should consume view models and callbacks, not raw workflow branching.

Prefer:

- `runtimeViewModel.state`
- `runtimeViewModel.canSend`
- `runtimeViewModel.hint`

Avoid:

- ad-hoc status priority logic duplicated in multiple screens
- API/status branching directly in JSX trees

## 6. Naming and Responsibility

Name hooks by responsibility:

- `useAgentIntentController`
- `useChatsOperationsController`
- `useHomeRecoveryController`

Avoid generic names like `useHomeLogic`, `useStuff`, `helpers`.

## 7. JSX Rules

- keep render trees focused on layout and mapping
- no business workflow loops in JSX
- prefer precomputed derived values before `return`
- keep conditional branches shallow and readable

If JSX starts mixing flow logic and rendering, move logic out first.

## 8. Performance Baseline

- memoize expensive derived values
- keep callback identities stable where child renders depend on them
- avoid list re-renders from broad object recreation
- keep high-frequency updates (typing/realtime) isolated in dedicated controllers

## 9. Review Checklist (PR)

- Is this readable in one pass by a new teammate?
- Are side-effects isolated to hooks/controllers?
- Is domain logic extracted from screen render files?
- Are runtime decisions centralized via view model?
- Did we run `prettier`, `lint`, and `typecheck`?

If any answer is "no", refactor before merge.
