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
- Replay suite runner:
  - `pnpm eval:replay`
- Current runner is structural only.
  - It validates case shape and writes standard artifacts.
  - It does not yet replay real historical traffic.

## Next Steps

### 1. Convert replay scaffold into real replay
- Add a sanitized historical conversation export format.
- Store:
  - prompt history
  - allowed tools
  - forbidden tools
  - expected side-effect policy
  - expected completion properties
- Add a replay execution adapter with:
  - side effects disabled
  - tool calls recorded
  - latency recorded
  - output and tool-usage diffing

### 2. Expand golden suites beyond social simulation
- Add curated product goldens for:
  - reconnect/auth recovery
  - message routing
  - approval/refusal behavior
  - safe tool gating
  - cross-channel continuity
- These should be deterministic and pre-release gated.

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
2. second golden suite for critical product flows
3. production quality event schema
4. benchmark dashboards and nightly reports
5. human review sampling from worst replay and golden failures

