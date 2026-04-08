# Eval Roadmap

This repository now has the first reusable eval contract under `scripts/evals/`.

## Implemented

### Golden eval layer
- Shared artifact contract:
  - `run.json`
  - `summary.json`
  - `cases.jsonl`
  - `failures.jsonl`
- System-level simulated gate now exists:
  - `pnpm eval:system`
  - `pnpm eval:system:live:workflows`
- Social simulation benchmark matrix:
  - fixed seeds
  - mean score
  - score standard deviation
  - worst-seed score
  - family-level mean and stability metrics
- Golden suite runner:
  - `pnpm eval:golden`

### Replay eval scaffold
- Replay corpus contract:
  - `scripts/evals/replay/sample-replay-corpus.json`
  - `scripts/evals/replay/sample-historical-replay-corpus.json`
  - `scripts/evals/replay/sample-historical-export.jsonl`
- Replay suite runner:
  - `pnpm eval:replay`
- Workflow replay export fetcher now exists:
  - `pnpm eval:replay:fetch:workflows`
- Live workflow replay composition now exists:
  - `pnpm eval:replay:live:workflows`
- Live fetch-sanitize-replay workflow composition now exists:
  - `pnpm eval:replay:live:sanitized:workflows`
- Historical replay import:
  - `pnpm eval:replay:import -- --input=... --output=...`
- Runtime export sanitization now exists:
  - `pnpm eval:replay:sanitize -- --input=... --output=...`
- Replay/admin fetchers now reuse the same staging/prod smoke env fallback patterns as CI:
  - `SMOKE_*`
  - `STAGING_SMOKE_*`
  - `PROD_SMOKE_*`
- Replay runner can now consume raw historical exports directly:
  - `pnpm eval:replay -- --source=historical-export --corpus=...`
- Current runner now supports command-backed, side-effect-free replay cases.
- Historical replay cases can now carry:
  - conversation transcript/history
  - expected output snippets
  - expected tool calls
  - forbidden tool calls
  - latency budget
- Historical exports can also carry observed tool/output data for offline replay scoring.
- It still needs real historical corpus ingestion and output diffing against production traces.

### Product goldens
- Second golden suite entrypoint now exists for critical product flows.
- Current implementation executes the existing agent test/eval lane and captures real suite summary artifacts.
- It now also supports live/admin snapshot validation:
  - `pnpm eval:golden:product:live`
- Product manifest now enforces:
  - minimum case count
  - minimum record count
  - maximum failed cases
  - maximum failed records
  - required check ids
  - required scenario ids
  - forbidden failure classes
- Immediate next step is to replace dry-run mode with live curated flow execution for:
  - reconnect/auth recovery
  - approval/refusal behavior
  - tool gating
  - cross-channel continuity

### Online quality reporting scaffold
- Standard quality event report runner now exists.
- Admin snapshot fetcher now exists:
  - `pnpm eval:online:fetch:agentic`
- Workflow snapshot fetcher now exists:
  - `pnpm eval:online:fetch:workflows`
- Live composed report now exists:
  - `pnpm eval:online:live:agentic`
- It can now summarize either:
  - JSONL quality event streams
  - `run-agent-test-suite` artifacts via `--source=agent-suite`
  - agentic eval snapshots via `--source=agentic-evals-snapshot`
  - agent workflow snapshots via `--source=agent-workflows-snapshot`
  - runtime/admin event exports via `--source=runtime-admin-export`
- Current input is JSONL with fields:
  - `conversation_id`
  - `message_id`
  - `channel`
  - `provider`
  - `deploy_sha`
  - `tool_family`
  - `quality_score`
  - `retry_count`
  - `escalated`
  - `failure_taxonomy`
  - `created_at`
- Current report emits:
  - average score
  - failure counts
  - escalation rate
  - retry rate
  - breakdowns by channel/provider/tool family/failure taxonomy

### System validation gate
- Simulated system gate now composes:
  - social simulation benchmark
  - product critical goldens
  - replay corpus
  - historical replay corpus
  - historical export replay pack
  - sanitized runtime export replay pack
- It can now optionally replace the static sanitized runtime replay pack with:
  - live fetched + sanitized workflow replay traces
- Product-critical coverage in the system gate now defaults to:
  - `scripts/evals/golden/sample-product-critical-artifact.json`
- Baseline/threshold contract now exists at:
  - `scripts/evals/system/system-baseline.json`
- Current gate emits:
  - suite threshold failures
  - overall threshold failures
  - combined pass/fail status
  - per-suite artifact references and scores
- Matrix status command now exists:
  - `pnpm eval:system:status`
- It resolves the latest system-gate artifact and reports:
  - overall system status
  - current social-sim benchmark score, variance, and family metrics
  - per-suite threshold status
  - per-suite source artifact locations
- Social-sim thresholding now also checks family-level minimums for:
  - recovery
  - circle
  - dense-social-graph
  - network-rebalancing
  - event-and-memory
- Replay fixtures now include adversarial but expected-safe cases for:
  - ambiguous intent clarification
  - malformed provider output recovery
  - cross-channel continuity
  - approval-boundary refusal
- Sanitized runtime-export fixtures now validate:
  - identifier masking
  - token/email/phone redaction
  - replay scoring on masked traces

## Next Steps

### 1. Convert replay runner into historical replay
- Historical import utility is now in place for JSON and JSONL sanitized exports.
- Workflow replay export fetch is now in place for replayable admin workflow traces.
- Live fetch-and-replay composition is now in place for workflow traces.
- Remaining work:
  - enrich fetched workflow replay exports with higher-fidelity user/assistant transcript fields
  - diff actual output/tool traces across versions

### 2. Expand golden suites beyond social simulation
- Add curated product goldens for:
  - reconnect/auth recovery
  - message routing
  - approval/refusal behavior
  - safe tool gating
  - cross-channel continuity
- These should be deterministic and pre-release gated.
- Current runner now asserts suite coverage and threshold failures.
- It now also supports pass-state assertions for critical checks and scenarios.
- Remaining work:
  - add flow-specific assertions per curated scenario
  - add curated live execution instead of suite-wrapper-only evaluation

### 3. Turn the system gate into a release gate
- Remaining work:
  - store accepted baseline snapshots per release line
  - diff current run against previous accepted baseline
  - wire `pnpm eval:system` into CI and pre-release jobs

### 4. Add production quality event logging
- Persist per-conversation quality events with:
  - `conversation_id`
  - `message_id`
  - `channel`
  - `provider`
  - `deploy_sha`
  - `tool_family`
  - `quality_score`
  - `retry_count`
  - `escalated`
  - `failure_taxonomy`
  - `created_at`
- Use this for nightly and weekly quality reports.
- Runtime/admin export parsing now exists.
- Agentic eval snapshot fetch is now wired to the real admin endpoint.
- Remaining work is wiring persisted analytics exports automatically instead of sample files and expanding beyond the eval snapshot endpoint.

### 5. Add social simulation family metrics to the benchmark
- Family-level aggregate reporting is now in place for the seed matrix.
- Add temporal success metrics:
  - recovery transition completion
  - required group closure ordering
  - forbidden-edge avoidance after reroute

### 6. Add CI rollout
- Pre-merge:
  - fast golden subset
- Pre-release:
  - full golden suite
  - full social simulation matrix
- Nightly:
  - replay suite
  - benchmark trend reporting

## Suggested Rollout Order

1. real replay runner
2. live product-critical golden execution
3. production quality event persistence
4. benchmark dashboards and nightly reports
5. human review sampling from worst replay and golden failures
