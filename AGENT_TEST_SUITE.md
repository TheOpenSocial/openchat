# OpenSocial Agent Test Suite

This document is the canonical backend verification and remediation runbook for OpenSocial's agentic runtime.

The suite exists to prove that the backend can:
- understand intent
- negotiate or defer intelligently
- ground decisions in retrieval and durable memory
- prevent duplicate or unsafe side effects
- survive retries, dead letters, bursts, and moderation events
- remain observable, replayable, and operable in staging and production

## Validation Philosophy
- Scenario-first, not endpoint-first.
- Replayable, not only pass/fail.
- Traceable, not only log-based.
- Exactly-once for user-visible side effects.
- Safe degradation over silent failure.
- Operator-visible health is part of correctness.

## Current Foundation
- Workflow execution tracking is active in the backend through `workflowRunId`, `traceId`, stage checkpoints, and linked side effects.
- Canonical runtime API surface is single-version under `/api/runtime/*` with no legacy compatibility route.
- Workflow checkpoints now cover early exits explicitly (`intent_not_processable`, moderation-gated routing skips, and launch-control follow-up suppression) so traces stay complete even when no fanout occurs.
- Replay-safe dedupe is active for `intent_request` fanout reuse, recent duplicate async follow-up thread suppression, and workflow-linked follow-up notification reuse on replay.
- Replay-safe dedupe is active for accepted-request connection setup side effects: sender/participant notifications, sender-thread workflow updates, group-ready fanout notifications, and group backfill notifications are now workflow-linked and replay-reused to avoid duplicate visible outcomes.
- Backend ops can inspect replayability (`replayable` / `partial` / `inspect_only`) and dedupe integrity signals for recent workflow runs.
- Admin playground orchestration is wired for internal verification runs through:
  - `POST /api/admin/playground/bootstrap`
  - `POST /api/admin/playground/run-suite`
  - `GET /api/admin/ops/agent-reliability`
  This path now reuses the shared verification-run cache contract so canary status reflects playground-triggered suite runs.
- Memory writes are now normalized through typed taxonomy/provenance envelopes with strict safe-write suppression, contradiction policies, and compressed retrieval bundles for bounded long-context grounding.
- Negotiation runtime is now structured and bounded through `negotiation.evaluate` (social + commerce packet/outcome contracts, policy gating, and explicit next-action decisions).
- Canonical fixture parity is now locked for reconnect + eval runtime coverage (`reconnect_signal_v1` executed in scenario suite, `eval_workflow_runtime_traceability_v1` present in fixture corpus and eval contract).
- The current backend baseline must remain green:
  - `pnpm --filter @opensocial/api typecheck`
  - `pnpm --filter @opensocial/api lint`
  - `pnpm release:check:api`
- Latest verified full runner artifact:
  - `.artifacts/agent-test-suite/agent-suite-2026-03-25T22-24-14-923Z/full.json`

## System Under Test
The backend flow under test is:

`message -> parse -> moderation -> ranking -> negotiation -> fanout -> follow-up -> acceptance -> connection/chat -> memory/analytics -> replay/ops`

The suite covers these domains through a machine-readable matrix in:
- `apps/api/test/fixtures/agentic-scenarios.json` (`domainCoverage`)

Current matrix statuses:
- supported: social, passive discovery, groups/circles, events/reminders, dating-ready, commerce, safety/moderation, eval runtime

Each domain maps to:
- canonical scenario ids
- release-gate layers (`workflow|scenario|benchmark|eval|full`)
- domain-complete coverage with no `partial`/`policy_gated` status for release claims

## Backend-Only Pass Coverage (ATS-08/09/10)
| Area | Covered in this pass | Intentionally out of scope in this pass |
| --- | --- | --- |
| ATS-08 Eval grading | New dimensions (`tone`, `usefulness`, `grounding`) plus explicit weighted `traceGrade` checks and regression signals in admin snapshot | New product domains not yet modeled in API contracts |
| ATS-09 Bench/canary gates | Concurrency + burst pressure guardrails, duplicate/queue-lag thresholds, machine-readable artifact expansion, strict verification lane command | Changing runtime model/provider strategy or mobile-side performance UX |
| ATS-10 Admin reliability contracts | Additive ops endpoints for reliability snapshot and verification-run ingest/read | Admin UI refactor/console redesign |
| Verification lane | `pnpm test:agentic:suite:verification` command path and gating logic | Running verification without required staging/prod credentials |

## Workflow Backbone Requirements
All qualifying runs must emit:
- `workflowRunId`
- `traceId`
- domain
- entity owner and primary entity id
- stage checkpoints
- linked side effects
- degraded/block/skip reasons when applicable

The minimum persisted stages are:
- `parse`
- `moderation`
- `ranking`
- `fanout`
- `followup_enqueue`
- `followup_delivery`
- `connection_setup`

All user-visible side effects should be linkable back to the workflow run:
- intro requests
- notifications
- agent-thread workflow updates
- agent-thread follow-up messages
- connections
- chats
- circle/session actions

## Suite Layers
### 1. Contract
Validates:
- `@opensocial/openai` structured outputs
- deterministic fallback behavior
- service-level invariants
- schema and moderation gating

### 2. Workflow
Validates:
- intent creation
- fanout behavior
- follow-up scheduling
- request acceptance
- connection/chat setup
- workflow checkpoints and side-effect linking

### 3. Queue and Replay
Validates:
- retries
- backoff
- dead-letter capture
- replay safety
- duplicate suppression
- delayed job correctness

### 4. Scenario and E2E
Uses one canonical scenario corpus and one synthetic world fixture set covering:
- users
- language/country
- availability
- trust/verification
- blocks/reports
- prior interactions
- life-graph signals
- passive opportunities
- seller/buyer supply-demand
- moderation state
- memory state

Current fixture source of truth:
- `apps/api/test/fixtures/agentic-scenarios.json`
- `apps/api/test/fixtures/agentic-synthetic-world.json`

Runner wiring note:
- `scripts/run-agent-test-suite.mjs` now auto-loads scenario ids per layer from `agentic-scenarios.json` (`layerTargets`), so newly added scenarios automatically flow into tagged runs without hardcoded id drift.
- `agentic-scenario-suite.spec.ts` now enforces domain release-layer alignment: each `domainCoverage.releaseGateLayers` value (excluding `full`) must map to at least one scenario id tagged with that layer target.

Current scenario-backed coverage is strongest in:
- social 1:1 fanout and no-match recovery
- blocked/trust/country-language filtering
- reconnect discovery
- blocked reconnect suppression after relationship-policy filtering
- passive discovery bundles
- inbox suggestion prioritization
- agent recommendation publishing into the latest thread
- delayed widening and retry escalation
- launch-control follow-up suppression in no-match recovery (`social_followup_launch_controls_disabled_v1`)
- accepted-request replay-safe connection setup dedupe (sender/recipient notification + sender-thread update reuse), including replayed group backfill notification suppression
- topic-clustered group suggestions
- blocked-user enforcement for 1:1 direct-message sends
- muted/report-based suppression for direct-message and group sends
- blocked-user enforcement inside active chat/group messaging
- muted/reported peer suppression in reconnect discovery
- group archival when active membership drops below threshold
- blocked relationship suppression for recurring-circle member adds
- mute relationship suppression for recurring-circle member adds (both directions)
- open-report suppression for recurring-circle member adds
- scheduled passive discovery briefings delivered into notifications and agent threads
- scheduled reconnect briefings delivered into notifications and agent threads
- saved-search result delivery into notifications and agent threads
- saved-search below-threshold execution routed to agent-thread-only delivery
- saved-search empty-result suppression with `deliveryMode=none` (no notification/thread write)
- social reminder delivery through notification and agent-thread updates
- social reminder agent-thread-only delivery mode without notification fanout
- social reminder quiet-hours routing that coerces notification modes to agent-thread delivery
- deterministic scam/spam moderation gating and review
- deterministic underage/illegal exploitation blocking and coercive-underage review routing
- social negotiation async defer/intro decisions
- dating verified-consent lifecycle, revocation, no-match recovery, and blocked cross-over policy handling
- commerce listing/offer/counteroffer, escrow accept/freeze/release paths, dispute routing, and fulfillment transitions

### 5. Eval and Trace Grading
Grades:
- correctness
- boundedness
- safety
- tone
- usefulness
- negotiation quality
- grounding / hallucination resistance

Current backend eval snapshot contract also includes:
- `scorecard`: per-dimension totals, pass rate, and score
- `traceGrade`: weighted grade/status view across safety, boundedness, policy, observability, correctness, and outcomes
- `regressions`: triage-ready degradation signals with severity and threshold context
- workflow runtime traceability scenario (`eval_workflow_runtime_traceability_v1`) to detect drift in trace/replay integrity
- negotiation-quality scenario (`eval_negotiation_quality_v1`) to detect planner regression on commerce/social negotiation routing
- async ack tone scenario (`eval_tone_agentic_async_ack_v1`)
- no-match recovery usefulness scenario (`eval_usefulness_no_match_recovery_v1`)
- profile-memory grounding consistency scenario (`eval_grounding_profile_memory_consistency_v1`)

### 6. Benchmark and Prod Smoke
Validates:
- ack latency
- follow-up latency
- fallback rate
- queue drain behavior
- duplicate side-effect rate
- replay success rate

Prod-connected verification must use reserved users/threads and controlled pacing.

## Mandatory Scenario Families
- social 1:1
- social groups and circles/events
- passive availability and reconnects
- semantic similarity and life-graph affinity
- country/language compatibility
- trust/verification eligibility
- block/report/mute across retrieval, DMs, groups, circles, and commerce
- async ack, progress follow-up, no-match recovery, delayed widening
- duplicate retry and replay safety
- workflow stage-failure triage families (llm/schema, queue/replay, notification/follow-up, persistence/dedupe, latency/capacity, observability-gap)
- memory write/read, contradiction handling, compression, hallucination resistance
- agent-to-agent and buyer-seller negotiation
- spam, scam, coercion, underage/illegal, moderation review/blocked flows
- buyer intent, seller intent, passive demand, passive supply, item/offer compatibility
- burst load, queue saturation, reconnect, and canary regression detection

## Release Gates
A release is blocked if:
- any canonical scenario fails
- any duplicate visible side effect is observed
- any blocked/reporting/privacy invariant is violated
- benchmark thresholds regress
- replay cannot reconstruct qualifying failures
- eval pass rate or trace-grade quality drops below threshold
- admin reliability surfaces cannot explain current failures

## Machine-Readable Run Artifacts
Every suite run should produce:
- suite run id
- layer
- scenario id
- workflow run id
- trace id
- pass/fail
- latency metrics
- fallback/degraded reason
- side effects observed
- failure class

Failure classes:
- llm_or_schema
- moderation_or_policy
- matching_or_negotiation
- queue_or_replay
- persistence_or_dedupe
- notification_or_followup
- latency_or_capacity
- observability_gap

## Remediation Loop
For every failing scenario:
1. reproduce
2. classify the failure
3. add or tighten regression coverage
4. implement the fix
5. rerun the failing layer
6. rerun the full gate before closing

No fix is complete until regression protection exists.

## Suggested Commands
Use targeted commands first, then full verification:

```bash
pnpm --filter @opensocial/api test
pnpm --filter @opensocial/api typecheck
pnpm --filter @opensocial/api lint
pnpm benchmark:agentic
pnpm benchmark:onboarding
pnpm release:check:api
pnpm test:agentic:suite -- --layer=scenario
pnpm test:agentic:suite -- --layer=prod-smoke
pnpm test:agentic:suite -- --layer=full
pnpm staging:smoke:verification-lane
pnpm test:agentic:suite:verification
pnpm test:agentic:suite:verification:failed
pnpm test:backend:ops-pack
```

The backend golden suite runner currently supports:
- `contract`
- `workflow`
- `queue`
- `scenario`
- `eval`
- `benchmark`
- `prod-smoke`
- `full`

Current runner artifact behavior:
- writes JSON artifacts under `.artifacts/agent-test-suite/<run-id>/`
- scenario-backed layers emit canonical `scenarioIds` in the JSON artifact so regressions can be tracked across tests, evals, and benchmarks
- artifacts now also emit normalized per-scenario `records` with: `runId`, `layer`, `checkId`, `scenarioId`, `workflowRunId`, `traceId`, `status`, `latencyMs`, `failureClass`, and `sideEffects`
- artifact contract schemas are now formalized in `@opensocial/types` (`agentTestSuiteArtifactSchema` + `agentTestSuiteArtifactRecordSchema`) with dedicated regression coverage
- benchmark defaults to the canonical scenario corpus in `apps/api/test/fixtures/agentic-scenarios.json` and runs the entries tagged for `benchmark`
- benchmark artifacts are emitted when `AGENTIC_BENCH_*` env is present
- benchmark layer is skipped by default when credentials are absent unless `AGENT_TEST_SUITE_REQUIRE_BENCHMARK=1`
- benchmark guardrails now fail the run when any threshold is breached:
  - `AGENTIC_BENCH_MIN_ACK_WITHIN_SLO_RATE`
  - `AGENTIC_BENCH_MIN_BACKGROUND_FOLLOWUP_RATE`
  - `AGENTIC_BENCH_MAX_DEGRADED_RATE`
- benchmark can now enforce workflow-runtime health guardrails when enabled:
  - `AGENTIC_BENCH_ENABLE_WORKFLOW_HEALTH=1`
  - `AGENTIC_BENCH_REQUIRE_WORKFLOW_HEALTH=1`
  - `AGENTIC_BENCH_ADMIN_USER_ID` (+ optional `AGENTIC_BENCH_ADMIN_ROLE`, `AGENTIC_BENCH_ADMIN_API_KEY`)
  - `AGENTIC_BENCH_MAX_CRITICAL_WORKFLOW_RUNS`
  - `AGENTIC_BENCH_MAX_FAILED_STAGE_COUNT`
  - `AGENTIC_BENCH_MAX_BLOCKED_STAGE_COUNT`
  - `AGENTIC_BENCH_MAX_OBSERVABILITY_GAP_RUNS`
- benchmark concurrency/pressure guardrails are now supported with:
  - `AGENTIC_BENCH_CONCURRENCY`
  - `AGENTIC_BENCH_BURST_SIZE`
  - `AGENTIC_BENCH_MAX_DUPLICATE_SIDE_EFFECT_RATE`
  - `AGENTIC_BENCH_MAX_QUEUE_LAG_MS`
- benchmark network-resilience tuning is now supported with:
  - `AGENTIC_BENCH_REQUEST_TIMEOUT_MS`
  - `AGENTIC_BENCH_REQUEST_RETRY_COUNT`
  - `AGENTIC_BENCH_REQUEST_RETRY_DELAY_MS`
- benchmark records now emit pressure/dedupe metrics (`workerIndex`, `burstIndex`, `concurrency`, `burstSize`, `queueLagMs`, `duplicateVisibleSideEffects`, `duplicateVisibleSideEffectRate`) and summary includes `queueLagP95Ms`
- strict verification lane now enables and requires benchmark workflow-health checks by default
- prod-smoke lane executes `staging-smoke-api`, `staging-smoke-llm-runtime`, and `staging-incident-verify` when enabled
- prod-smoke lane is orchestrated by `scripts/run-agent-prod-smoke-lane.mjs` and emits a lane artifact consumed by the tagged suite artifact metadata
- prod-smoke is skipped by default and can be controlled with:
  - `AGENT_TEST_SUITE_ENABLE_PROD_SMOKE=1` (run smoke lane)
  - `AGENT_TEST_SUITE_REQUIRE_PROD_SMOKE=1` (fail if smoke lane is not enabled/passing)
- strict verification lane command (`pnpm test:agentic:suite:verification`) enforces benchmark and prod-smoke requirements in one pass and fails fast when required env vars are missing
- strict verification now runs in staged mode (`contract -> workflow -> queue -> scenario -> eval -> benchmark -> prod-smoke`) and writes a summary artifact at `.artifacts/agent-test-suite/verification-latest.json`
- strict verification retries only failing stages once per run; if a stage still fails, the run fails with explicit failed-stage reporting
- rerun-only-failures flow is available via:
  - `pnpm test:agentic:suite:verification:failed`
  - or `AGENT_TEST_SUITE_RERUN_FAILED_ONLY=1 pnpm test:agentic:suite:verification`
  - optionally pin stages explicitly with `AGENT_TEST_SUITE_ONLY_STAGES=benchmark,prod-smoke`
- strict verification now supports temporary staging=prod env resolution (`STAGING_EQUALS_PROD=true`) so missing `STAGING_*` verification keys can resolve from `PROD_*`/`PRODUCTION_*` aliases during parity windows
- local verification profile (for localhost-only smoke realism without staging credentials) can be run by supplying:
  - a valid local access token/session and user/thread ids for `AGENTIC_BENCH_*` and `SMOKE_*`
  - `SMOKE_MAX_ONBOARDING_FALLBACK_RATE=1` when local LLM providers are intentionally unavailable
  - `INCIDENT_VERIFY_ALLOW_CRITICAL=true` and `INCIDENT_VERIFY_REQUIRE_HEALTHY=false` when local alert state is intentionally degraded during development
  - keep staging/production lanes on strict defaults; these local overrides are only for deterministic localhost verification

## Admin Reliability Console Expectations
The admin must eventually expose:
- run overview
- trace explorer
- replay center
- eval/drift board

Current backend data contracts already available for this track:
- `GET /api/admin/ops/agent-workflows` (supports `replayability`, `domain`, `dedupeOnly`, `health`, `failureClass`, `failuresOnly`, and `suspectStage` filters plus aggregate stage-status/health/failure-class summaries and `topFailureStages`)
- `GET /api/admin/ops/agent-workflows/details?workflowRunId=...` (includes `insights` with workflow health, latest checkpoint, stage-status counts, and run-level triage guidance including `suspectStages` + `replayHint`)
- `GET /api/admin/ops/agentic-evals`
- `POST /api/admin/ops/verification-runs`
- `GET /api/admin/ops/verification-runs`
- `GET /api/admin/ops/agent-reliability`
- integrity board
- trust/safety board
- negotiation visibility
- canary/deploy health

The existing runtime health, agentic evals, dead-letter, and replay paths are the current foundation.

## Interruption-Safe Handoff
If work is interrupted, the next implementer should:
1. check `PROGRESS.md` ATS tasks in order
2. inspect recent workflow runs in admin ops
3. inspect latest failing scenarios and benchmarks
4. continue from the earliest incomplete dependency

This document and `PROGRESS.md` together are the source of truth for continuation.
