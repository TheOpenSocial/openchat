# Eval Roadmap

This repository now has the first reusable eval contract under `scripts/evals/`.

## Implemented

### Golden eval layer
- Shared artifact contract:
  - `run.json`
  - `summary.json`
  - `cases.jsonl`
  - `failures.jsonl`
- Social simulation benchmark matrix:
  - fixed seeds
  - mean score
  - score standard deviation
  - worst-seed score
- Golden suite runner:
  - `pnpm eval:golden`

### Replay eval scaffold
- Replay corpus contract:
  - `scripts/evals/replay/sample-replay-corpus.json`
  - `scripts/evals/replay/sample-historical-replay-corpus.json`
- Replay suite runner:
  - `pnpm eval:replay`
- Current runner now supports command-backed, side-effect-free replay cases.
- Historical replay cases can now carry:
  - conversation transcript/history
  - expected output snippets
  - expected tool calls
  - forbidden tool calls
  - latency budget
- It still needs real historical corpus ingestion and output diffing against production traces.

### Product goldens
- Second golden suite entrypoint now exists for critical product flows.
- Current implementation executes the existing agent test/eval lane and captures real suite summary artifacts.
- Immediate next step is to replace dry-run mode with live curated flow execution for:
  - reconnect/auth recovery
  - approval/refusal behavior
  - tool gating
  - cross-channel continuity

### Online quality reporting scaffold
- Standard quality event report runner now exists.
- It can now summarize either:
  - JSONL quality event streams
  - `run-agent-test-suite` artifacts via `--source=agent-suite`
  - agentic eval snapshots via `--source=agentic-evals-snapshot`
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

## Next Steps

### 1. Convert replay runner into historical replay
- Add a sanitized historical conversation export format.
- Store:
  - prompt history
  - allowed tools
  - forbidden tools
  - expected side-effect policy
  - expected completion properties
- Extend the existing command-backed replay execution with:
  - sanitized historical transcript input
  - tool-call capture
  - latency capture
  - output and tool-usage diffing

### 2. Expand golden suites beyond social simulation
- Add curated product goldens for:
  - reconnect/auth recovery
  - message routing
  - approval/refusal behavior
  - safe tool gating
  - cross-channel continuity
- These should be deterministic and pre-release gated.
- Replace the current suite-wrapper approach in `product-critical-goldens.mjs` with flow-specific scenario assertions and curated live execution.

### 3. Add production quality event logging
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
- Wire report input from real runtime/admin analytics instead of sample JSONL and derived suite artifacts.

### 4. Add social simulation family metrics to the benchmark
- Report family-level aggregates explicitly:
  - recovery
  - bridge/graph closure
  - recurring circle restoration
  - containment
  - memory/event continuity
- Add temporal success metrics:
  - recovery transition completion
  - required group closure ordering
  - forbidden-edge avoidance after reroute

### 5. Add CI rollout
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
