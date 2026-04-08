# Agentic Evals Architecture

This document defines the current simulation and agentic test system in this repository, what each score means, what it does not mean, and what is required to reach a ChatGPT-like evaluation standard.

## Purpose

The current eval system is designed to answer four questions:

1. Did we break a covered behavior?
2. Did we regress a known product flow?
3. Did we regress simulation behavior inside the current synthetic world model?
4. Is the deployed staging stack still able to execute covered live replay and snapshot paths?

It is not yet designed to answer the stronger question:

- “Is this system close to real-world user experience quality?”

That distinction matters. Most current scores are regression signals, not final product-truth scores.

## Current Commands

### System gates

- `pnpm eval:system`
- `pnpm eval:system:live:workflows`
- `pnpm eval:system:status`
- `pnpm eval:system:compare`

### Golden suites

- `pnpm eval:golden`
- `pnpm eval:golden:product`
- `pnpm eval:golden:product:live`
- `pnpm eval:social:benchmark`

### Replay suites

- `pnpm eval:replay`
- `pnpm eval:replay:import`
- `pnpm eval:replay:sanitize`
- `pnpm eval:replay:fetch:workflows`
- `pnpm eval:replay:live:workflows`
- `pnpm eval:replay:live:sanitized:workflows`

### Online reporting

- `pnpm eval:online:report`
- `pnpm eval:online:fetch:agentic`
- `pnpm eval:online:fetch:workflows`
- `pnpm eval:online:live:agentic`

## Artifact Contract

All eval runs use the shared artifact contract from [`/Users/cruciblelabs/Documents/openchat/scripts/evals/shared/artifacts.mjs`](/Users/cruciblelabs/Documents/openchat/scripts/evals/shared/artifacts.mjs):

- `run.json`
- `summary.json`
- `cases.jsonl`
- `failures.jsonl`

Default artifact root:

- [`/Users/cruciblelabs/Documents/openchat/.artifacts/evals`](/Users/cruciblelabs/Documents/openchat/.artifacts/evals)

This is the canonical place to inspect score provenance.

## Current Eval Layers

### 1. Social simulation benchmark

Entry point:

- [`/Users/cruciblelabs/Documents/openchat/scripts/evals/golden/social-sim-benchmark.mjs`](/Users/cruciblelabs/Documents/openchat/scripts/evals/golden/social-sim-benchmark.mjs)

What it does:

- runs a fixed seed matrix
- reports:
  - mean score
  - score stddev
  - worst-seed score
  - oracle metrics
  - family-level scores

Current families:

- `individual-matchmaking`
- `recovery`
- `pair-and-group`
- `circle`
- `dense-social-graph`
- `event-and-memory`
- `network-rebalancing`

What this score means:

- whether the current simulator performs well against the repository’s synthetic world corpus
- whether a change regressed graph behavior inside those fixtures

What it does not mean:

- that the app behaves like real users will experience it
- that the social graph behavior is validated against real-world social outcomes

Important limitation:

- the deterministic matrix used by the system gate is still mostly offline/stub backed

### 2. Product critical goldens

Entry points:

- [`/Users/cruciblelabs/Documents/openchat/scripts/evals/golden/product-critical-goldens.mjs`](/Users/cruciblelabs/Documents/openchat/scripts/evals/golden/product-critical-goldens.mjs)
- [`/Users/cruciblelabs/Documents/openchat/scripts/evals/golden/product-critical-manifest.json`](/Users/cruciblelabs/Documents/openchat/scripts/evals/golden/product-critical-manifest.json)

What it does:

- validates required scenarios and checks
- enforces:
  - required check ids
  - required passed check ids
  - required scenario ids
  - required passed scenario ids
  - maximum failures
  - forbidden failure classes

What this score means:

- whether critical covered product scenarios still satisfy the current manifest

What it does not mean:

- that the product is broadly high quality outside the curated scenario set

Important limitation:

- current product goldens still lean on suite artifacts and snapshot-backed evidence more than fully curated live flow execution

### 3. Replay evals

Entry point:

- [`/Users/cruciblelabs/Documents/openchat/scripts/evals/replay/run-replay-evals.mjs`](/Users/cruciblelabs/Documents/openchat/scripts/evals/replay/run-replay-evals.mjs)

Related tools:

- [`/Users/cruciblelabs/Documents/openchat/scripts/evals/replay/fetch-workflow-replay-export.mjs`](/Users/cruciblelabs/Documents/openchat/scripts/evals/replay/fetch-workflow-replay-export.mjs)
- [`/Users/cruciblelabs/Documents/openchat/scripts/evals/replay/sanitize-runtime-export.mjs`](/Users/cruciblelabs/Documents/openchat/scripts/evals/replay/sanitize-runtime-export.mjs)
- [`/Users/cruciblelabs/Documents/openchat/scripts/evals/replay/import-historical-replay.mjs`](/Users/cruciblelabs/Documents/openchat/scripts/evals/replay/import-historical-replay.mjs)
- [`/Users/cruciblelabs/Documents/openchat/scripts/evals/replay/run-live-sanitized-workflow-replay.mjs`](/Users/cruciblelabs/Documents/openchat/scripts/evals/replay/run-live-sanitized-workflow-replay.mjs)

What replay checks:

- selected tool correctness
- forbidden tool usage
- required behaviors
- expected output snippets
- expected tool calls
- forbidden tool calls
- latency budget
- side-effect expectations

What replay means:

- whether recorded or synthetic traces still satisfy their current execution contract

What replay does not mean:

- that users liked the output
- that the output was the best possible response
- that the contract itself is realistic enough

### 4. Online quality reporting

Entry point:

- [`/Users/cruciblelabs/Documents/openchat/scripts/evals/online/report-quality-events.mjs`](/Users/cruciblelabs/Documents/openchat/scripts/evals/online/report-quality-events.mjs)

What it aggregates:

- quality score
- retry rate
- escalation rate
- failure taxonomy
- breakdown by channel/provider/tool family

What it is good for:

- operational monitoring
- trend analysis
- deploy-sha breakdowns once real persisted sources are wired in regularly

Important limitation:

- the reporting layer is in place, but recurring production-quality persistence and correlation are still incomplete

### 5. System validation gate

Entry point:

- [`/Users/cruciblelabs/Documents/openchat/scripts/evals/system/run-system-evals.mjs`](/Users/cruciblelabs/Documents/openchat/scripts/evals/system/run-system-evals.mjs)

Baseline:

- [`/Users/cruciblelabs/Documents/openchat/scripts/evals/system/system-baseline.json`](/Users/cruciblelabs/Documents/openchat/scripts/evals/system/system-baseline.json)
- [`/Users/cruciblelabs/Documents/openchat/scripts/evals/system/system-baseline-history.json`](/Users/cruciblelabs/Documents/openchat/scripts/evals/system/system-baseline-history.json)

Status view:

- [`/Users/cruciblelabs/Documents/openchat/scripts/evals/system/matrix-status.mjs`](/Users/cruciblelabs/Documents/openchat/scripts/evals/system/matrix-status.mjs)
- [`/Users/cruciblelabs/Documents/openchat/scripts/evals/system/compare-system-baseline.mjs`](/Users/cruciblelabs/Documents/openchat/scripts/evals/system/compare-system-baseline.mjs)

What it does:

- composes:
  - social-sim benchmark
  - optional live provider-backed social-sim benchmark
  - product critical goldens
  - replay corpus
  - historical replay corpus
  - historical export replay
  - sanitized runtime export replay
- enforces suite thresholds
- emits a combined pass/fail result
- emits confidence rows for:
  - deterministic regression confidence
  - live replay confidence
  - social realism confidence
  - real-world correlation confidence

What it means:

- the covered system is healthy enough according to the current baseline

What it does not mean:

- that the app is “95% good”
- that real users will see equivalent quality

## Current Score Interpretation

### System average score

Current shape:

- average over suite-level results in the system gate

Use it for:

- covered-regression detection
- gate health

Do not use it for:

- absolute product quality
- comparing the app to real-world user satisfaction

### Social simulation score

Current shape:

- mean convergence score over a fixed seed matrix, plus oracle and family metrics

Use it for:

- simulation tuning
- synthetic graph-behavior regression detection
- family-level weak-spot tracking

Do not use it for:

- a claim that the simulated social behavior is validated against real-life user outcomes

### Replay scores

Use them for:

- contract adherence
- regression detection on tool selection and expected behaviors

Do not use them for:

- claims about conversational quality beyond the encoded contract

## Current Confidence Assessment

Current state should be interpreted as:

- deterministic regression confidence: medium to high
- live replay confidence: medium
- architectural confidence: medium
- social realism confidence: low to medium
- real-world correlation confidence: low

That is why the current stack is suitable as a regression gate, but not yet as a product-truth score.

## What “ChatGPT-like” Eval Maturity Would Require

A ChatGPT-like evaluation system is layered. It does not rely on one benchmark or one score.

Required layers:

1. Model evals
- instruction following
- tool selection
- grounding
- refusal and approval behavior
- schema adherence

2. Product goldens
- curated end-to-end flows
- deterministic gates

3. Replay / shadow evals
- historical conversations
- historical workflow traces
- side-effect-safe re-execution or offline scoring

4. Online production scoring
- deploy-sha trends
- retry rate
- abandonment/escalation
- tool-family regression tracking

5. Human and LLM review
- sampled audits of passes and failures
- realism and usefulness grading

The repository currently has partial coverage of layers 2, 3, and 4, and almost no formal layer 1 or 5.

## Highest-Priority Gaps

### 1. Live provider-backed social simulation

Need:

- a provider-backed social-sim matrix lane
- side-by-side comparison with deterministic stub lane

Why:

- current social-sim system score is still mostly synthetic

### 2. Baseline drift and history

Need:

- accepted baseline history
- delta comparison between current and previous accepted runs

Why:

- pass/fail alone hides drift and variance changes

### 3. Realism adjudication

Need:

- sampled LLM review on replay/live artifacts
- disagreement tracking across multiple judges or prompts

Why:

- current replay pass/fail is contract-shaped, not realism-shaped

### 4. Curated live product goldens

Need:

- live adapters for:
  - reconnect/auth
  - approval/refusal
  - tool gating
  - cross-channel continuity

Why:

- snapshot-backed goldens are not enough to prove live behavior

### 5. Production correlation

Need:

- compare eval scores against real production quality signals by deploy SHA

Why:

- without correlation, realism remains assumed rather than measured

## Operating Rules

When making release decisions:

- trust the current matrix as a regression and safety gate
- do not present the current scores as real-world quality truth
- use live replay and staging evals as stronger evidence than synthetic-only passes
- treat social-sim as a controlled benchmark, not as proof of real social fidelity

## Recommended Next Implementation Order

1. add live provider-backed social-sim lane
2. add matrix realism/confidence rows
3. add baseline history and drift comparison
4. add LLM-reviewed replay sample pack
5. add curated live product-flow goldens
6. add production correlation by deploy SHA
