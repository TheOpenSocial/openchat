# Evals README

This directory contains the repository eval stack for simulation, replay, goldens, and system gating.

## Layout

- `shared/`
  - common artifact and env-resolution helpers
- `golden/`
  - deterministic or thresholded benchmark suites
- `replay/`
  - replay import, sanitization, fetch, and scoring
- `online/`
  - reporting and live snapshot fetchers
- `system/`
  - composed system gate, thresholds, and matrix status

## Primary Commands

### System

- `pnpm eval:system`
  - deterministic local system gate
- `pnpm eval:system:live:workflows`
  - system gate using live fetched + sanitized workflow replay
- `pnpm eval:system:status`
  - prints the latest local system matrix, thresholds, and artifact locations
- `pnpm eval:system:compare`
  - compares the latest matrix against the accepted baseline history

### Golden

- `pnpm eval:golden`
- `pnpm eval:golden:product`
- `pnpm eval:golden:product:live`
- `pnpm eval:social:benchmark`

### Replay

- `pnpm eval:replay`
- `pnpm eval:replay:import`
- `pnpm eval:replay:sanitize`
- `pnpm eval:replay:fetch:workflows`
- `pnpm eval:replay:live:workflows`
- `pnpm eval:replay:live:sanitized:workflows`

### Online

- `pnpm eval:online:report`
- `pnpm eval:online:fetch:agentic`
- `pnpm eval:online:fetch:workflows`
- `pnpm eval:online:live:agentic`

## Artifact Contract

Every eval run should emit:

- `run.json`
- `summary.json`
- `cases.jsonl`
- `failures.jsonl`

Default root:

- [`/Users/cruciblelabs/Documents/openchat/.artifacts/evals`](/Users/cruciblelabs/Documents/openchat/.artifacts/evals)

## Current Truth Model

These evals are currently best treated as:

- regression gates
- deploy-safety checks for covered paths
- synthetic benchmark controls

They are not yet strong enough to stand alone as:

- real-world product quality truth
- user-satisfaction truth
- social-realism truth

For the full architecture and interpretation rules, see:

- [`/Users/cruciblelabs/Documents/openchat/docs/agentic-evals-architecture.md`](/Users/cruciblelabs/Documents/openchat/docs/agentic-evals-architecture.md)
- [`/Users/cruciblelabs/Documents/openchat/docs/evals-roadmap.md`](/Users/cruciblelabs/Documents/openchat/docs/evals-roadmap.md)

## Current Matrix Additions

The system layer now supports:

- optional live provider-backed social-sim lane via `--live-social-sim=1`
- confidence rows in the system summary
- accepted baseline history comparison
