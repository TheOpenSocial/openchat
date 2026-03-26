# OpenSocial Backend Tasks

This file is the execution checklist for **remaining backend work** after the current checkpoint commit (`e4f602f`).

## 0) Golden Suite + Verification Lane (finish to true green on deployed env)
- [ ] Run strict verification lane against deployed environment:
  - `pnpm test:agentic:suite:verification`
- [ ] Run backend ops pack end-to-end with real env:
  - `pnpm test:backend:ops-pack`
- [ ] Confirm artifact generation and archive latest run ids:
  - `.artifacts/agent-test-suite/<run-id>/full.json`
  - `.artifacts/backend-ops-pack/<run-id>.json`
- [ ] Ensure staging/prod secret parity is stable (no missing verification keys).

Close when:
- strict verification is green in CI/deploy environment (not only local)
- ops-pack passes all enabled stages (release check, verification lane, smoke lane, moderation drill)

## 1) Onboarding Inference Launch Closure (TP-04, TP-05, TP-06, TP-07)
- [x] `TP-04` Improve rich persona/summary quality on EN/ES benchmark corpus (20+ transcripts), reduce generic outputs below threshold.
- [x] `TP-05` Finalize and document fast/rich model-routing policy with measurable p95 latency + quality acceptance gates.
- [x] `TP-06` Lock deploy parity for onboarding env vars across staging/prod/rollback.
- [x] `TP-07` Validate observability dashboards/alerts for onboarding success, timeout, fallback, and per-model latency buckets.

Close when:
- onboarding benchmark thresholds pass with documented evidence
- env parity checklist is reproducible and verified after deploy/rollback
- alerting and dashboards are populated with non-missing buckets

## 2) Session/Auth Reliability Closure (TP-08)
- [ ] Complete refresh-token reliability verification across mobile/web API flows.
- [ ] Ensure hard logout only happens on definitive refresh failure.
- [ ] Add/finish E2E + integration coverage for 401 retry + refresh behavior.

Close when:
- no false `session expired` regressions in integration/E2E tests
- retry/refresh behavior is deterministic and covered in CI

## 3) Onboarding Contract Coverage (TP-09)
- [ ] Add/finish API + client integration contract tests for:
  - transcript capture -> infer-fast/infer -> persona confirmation -> persistence.
- [ ] Assert lifecycle contract:
  - `infer-started`, `infer-processing`, `infer-success`, `infer-fallback`.

Close when:
- onboarding contract tests are green and blocking in CI

## 4) Secret Hygiene + Launch Security Cleanup (TP-10)
- [ ] Rotate temporary debug/probe tokens used during setup/testing.
- [ ] Verify no sensitive values remain in docs/log artifacts committed to repo.
- [ ] Re-confirm GitHub secrets scopes (repo/staging/production) after rotation.

Close when:
- rotated credentials are active
- no leaked secrets in repository history/docs/artifacts for current branch

## 5) Release Ops Completion (TP-11, TP-12)
- [ ] `TP-11` Execute full launch smoke matrix on staging + production with explicit pass/fail evidence and rollback decision points.
- [ ] `TP-12` Finalize launch readiness runbook (limits, fallbacks, monitors, kill switches, first-24h owner map).

Close when:
- smoke matrix runs are documented and green
- runbook is final and usable by on-call without tribal knowledge

## 6) Post-Onboarding Activation Flow Closure (TP-13, TP-14, TP-15)
- [ ] `TP-13` Validate typed activation state contract from backend on every onboarding completion path.
- [ ] `TP-14` Confirm activation handoff/resume behavior is reliable from backend perspective (idempotent responses, restart-safe state reads).
- [ ] `TP-15` Ensure starter-intent bootstrap is persisted with deterministic fallback when LLM output is weak/empty.

Close when:
- activation contract is deterministic and covered by integration tests
- no duplicate first-action side effects under retries/replays

## 7) Trust/Matching Feature Completion (TF-01 to TF-06)
- [x] `TF-01` Ship first-class backend support path for user controls:
  - `languagePreferences`, `countryPreferences`, verified-only matching, contact style.
- [x] `TF-02` Add reliability signals into ranking (reply rate, acceptance rate, follow-through, moderation incidents) with bounded weights and admin visibility.
- [x] `TF-03` Implement sparse-market adaptation strategy switching (intro/group/circle/follow-up by supply density).
- [x] `TF-04` Add bilingual/translation-tolerance matching behavior with explicit opt-in translation policy.
- [x] `TF-05` Add market-stage strategy controls (`empty`, `seed`, `healthy`) to adjust ranking/widening behavior by region.
- [ ] `TF-06` Run production operator drills for trust-sensitive lifecycle paths with real-user smoke evidence.

Evidence (2026-03-26):
- Matching runtime updated with reliability scoring, translation opt-in bridge, and market-stage strategy controls in `apps/api/src/matching/matching.service.ts`.
- Global rules contract extended with `translationOptIn` in `packages/types/src/index.ts` and `apps/api/src/personalization/personalization.service.ts`.
- Regression coverage added in `apps/api/test/matching.service.spec.ts` and `apps/api/test/personalization.service.spec.ts`.

Close when:
- ranking strategy behavior is measurable, explainable, and regression-tested
- operator drills prove trust-sensitive flows work end-to-end in deployed env

## 8) Moderation Drill Closure (M-06)
- [ ] Complete and record staging/prod moderation drill:
  - report -> flag -> triage -> enforcement -> audit verification.

Close when:
- moderation drill evidence is documented and reproducible

## 9) “Fully Supported” Claim Gate (program-level)
- [ ] Confirm domain coverage metadata has no `partial` or `policy_gated`.
- [ ] Confirm full Golden Suite + verification lane + burn-in canary are green.
- [ ] Confirm admin reliability APIs can explain failures without raw log spelunking.

Close when:
- release claim “fully supported” is evidence-backed and reproducible.

## 10) Command Checklist (backend gate commands)
- [x] `pnpm --filter @opensocial/types typecheck`
- [x] `pnpm --filter @opensocial/openai test`
- [x] `pnpm --filter @opensocial/api typecheck`
- [x] `pnpm --filter @opensocial/api lint`
- [x] `pnpm release:check:api`
- [ ] `pnpm test:agentic:suite -- --layer=contract`
- [ ] `pnpm test:agentic:suite -- --layer=workflow`
- [ ] `pnpm test:agentic:suite -- --layer=queue`
- [ ] `pnpm test:agentic:suite -- --layer=scenario`
- [ ] `pnpm test:agentic:suite -- --layer=eval`
- [ ] `pnpm test:agentic:suite -- --layer=benchmark`
- [ ] `pnpm test:agentic:suite -- --layer=prod-smoke`
- [ ] `pnpm test:agentic:suite -- --layer=full`
- [ ] `pnpm test:agentic:suite:verification`
- [ ] `pnpm test:backend:ops-pack`
