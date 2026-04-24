# Verification Matrix

This is the canonical verification map for OpenSocial.

Use it to answer four questions quickly:

1. What automation exists today?
2. What does each lane actually prove?
3. What artifact or workflow should we inspect first?
4. Is the lane currently trustworthy, green, conditional, or still under repair?

This document is intentionally operational. It is not a roadmap.

Related references:
- [`/Users/cruciblelabs/Documents/openchat/docs/backend-launch-ops-pack.md`](/Users/cruciblelabs/Documents/openchat/docs/backend-launch-ops-pack.md)
- [`/Users/cruciblelabs/Documents/openchat/docs/backend-launch-smoke-matrix.md`](/Users/cruciblelabs/Documents/openchat/docs/backend-launch-smoke-matrix.md)
- [`/Users/cruciblelabs/Documents/openchat/docs/release-readiness-backend.md`](/Users/cruciblelabs/Documents/openchat/docs/release-readiness-backend.md)
- [`/Users/cruciblelabs/Documents/openchat/docs/agentic-evals-architecture.md`](/Users/cruciblelabs/Documents/openchat/docs/agentic-evals-architecture.md)

## Status legend

- `green`: recently passed and trusted
- `in_progress`: currently running on the latest head
- `conditional`: working, but only proves a narrower slice or depends on env/secrets
- `red`: currently failing or not yet a dependable release gate

## Current snapshot

| Lane | Current status | Latest evidence |
| --- | --- | --- |
| CI | `green` | workflow [`24592599694`](https://github.com/TheOpenSocial/openchat/actions/runs/24592599694) passed after the stale API spec and fixture drift cleanup |
| Backend Ops Drill | `green` | workflow [`24579213926`](https://github.com/TheOpenSocial/openchat/actions/runs/24579213926) |
| Deploy Production | `green` | workflow [`24549101902`](https://github.com/TheOpenSocial/openchat/actions/runs/24549101902) |
| Build Images | `green` | workflow [`24548784197`](https://github.com/TheOpenSocial/openchat/actions/runs/24548784197) |
| System Evaluation Matrix | `green` | workflow [`24592070223`](https://github.com/TheOpenSocial/openchat/actions/runs/24592070223) passed with tolerance-aware live social-sim baseline comparison, clearing the last false regression in the live provider-backed lane |
| Staging Sandbox Validation | `green` | workflow [`24251759566`](https://github.com/TheOpenSocial/openchat/actions/runs/24251759566) |
| Staging Mobile E2E Session | `green` | workflow [`24367635640`](https://github.com/TheOpenSocial/openchat/actions/runs/24367635640) |
| Benchmark Onboarding | `green` | workflow [`23457925557`](https://github.com/TheOpenSocial/openchat/actions/runs/23457925557) |

## Core CI matrix

| Lane | Command / workflow | What it does | What a pass proves | Primary evidence | Status |
| --- | --- | --- | --- | --- | --- |
| Repo CI | [`.github/workflows/ci.yml`](/Users/cruciblelabs/Documents/openchat/.github/workflows/ci.yml) | Runs backend lint/typecheck/test, API contract slices, protocol-agent readiness tests, web/admin checks, and format validation | Mainline code compiles, core test suites pass, and protocol-agent readiness policy remains enforced in CI | GitHub Actions run + per-job logs | `green` |
| API lane | `pnpm turbo run test --filter=@opensocial/api...` | Runs backend Vitest coverage including protocol, controller, matching, moderation, and runtime specs | Backend unit/integration-style specs pass in CI | CI backend job logs | `green` |
| Protocol agent lane | `pnpm --filter @opensocial/protocol-agent test` | Runs protocol-agent readiness unit tests | SDK readiness semantics, including token freshness, are enforced in CI | CI backend job logs | `green` |
| SDK readiness pack | `pnpm test:sdk:readiness-pack -- --run` | Runs the protocol package test lanes for types, events, client, server, and agent | Public SDK package contracts remain stable as a bundle | CLI output or CI logs | `conditional` |
| OpenAI contracts | `pnpm --filter @opensocial/openai test` | Verifies the shared OpenAI package contract layer | Shared OpenAI-facing package behavior is stable enough for API consumers | CI backend job logs | `green` |
| API endpoint contracts | `pnpm --filter @opensocial/api test -- test/onboarding-agent.contract.spec.ts` | Runs a focused contract slice for protected agent onboarding endpoints | High-signal endpoint contract did not drift | CI backend job logs | `green` |
| Admin playground services | `pnpm --filter @opensocial/api test -- test/admin-playground.controller.spec.ts test/admin-playground.service.spec.ts` | Verifies operator playground controller/service behavior | Admin playground control plane is still contract-safe | CI backend job logs | `green` |
| Contract layer suite | `pnpm test:agentic:suite -- --layer=contract` | Runs the contract subset of the larger agentic suite | Core contract/scenario expectations still hold without needing the full live suite | CI backend job logs + suite artifacts | `green` |

## Release and deploy matrix

| Lane | Command / workflow | What it does | What a pass proves | Primary evidence | Status |
| --- | --- | --- | --- | --- | --- |
| Build Images | [`.github/workflows/build-images.yml`](/Users/cruciblelabs/Documents/openchat/.github/workflows/build-images.yml) | Builds and publishes API, admin, web, and docs images to GHCR | The deployable artifacts build successfully from the current head | GitHub Actions run + published image tags | `green` |
| Deploy Production | [`.github/workflows/deploy-production.yml`](/Users/cruciblelabs/Documents/openchat/.github/workflows/deploy-production.yml) | Pulls or builds images, runs migrations, restarts services, and verifies ingress health | Production stack can roll forward and pass deploy health gates | GitHub Actions run + live health endpoints | `green` |
| Deploy Staging | [`.github/workflows/deploy-staging.yml`](/Users/cruciblelabs/Documents/openchat/.github/workflows/deploy-staging.yml) | Staging deploy plus optional post-deploy verification | Staging can be refreshed with the same deploy model as production | GitHub Actions run + staging verification artifacts | `conditional` |
| Release API check | `pnpm release:check:api` | Validates API release readiness and runtime prerequisites | Backend release prerequisites are satisfied before deeper drills run | CLI output + backend ops pack artifacts | `green` inside ops pack |

## Backend ops and recovery matrix

| Lane | Command / workflow | What it does | What a pass proves | Primary evidence | Status |
| --- | --- | --- | --- | --- | --- |
| Backend Ops Drill | [`.github/workflows/backend-ops-drill.yml`](/Users/cruciblelabs/Documents/openchat/.github/workflows/backend-ops-drill.yml) | Boots smoke credentials, runs backend ops pack, uploads artifacts | Live backend control plane, moderation drill, protocol recovery drill, and verification subsets all work together against deployed infra | workflow [`24579213926`](https://github.com/TheOpenSocial/openchat/actions/runs/24579213926) + uploaded artifacts | `green` |
| Backend ops pack | `pnpm test:backend:ops-pack` | Runs release gate, verification lane, smoke lane, moderation drill, and protocol recovery drill | The backend is operationally shippable according to current package rules | `.artifacts/backend-ops-pack/<run-id>.json` | `green` |
| Staging smoke API | `pnpm staging:smoke:api` | Probes key backend health, admin ops, queue, and moderation endpoints | Core read-only backend/admin surfaces are alive and routable | CLI output + staging smoke artifacts | `green` as a component lane |
| Verification smoke lane | `pnpm staging:smoke:verification-lane` | Exercises the reserved verification lane and checks its required gates | Verification credentials and reserved scenario path still behave correctly | agent suite verification artifacts | `green` inside ops pack |
| Moderation drill | `pnpm moderation:drill` | Runs report -> flag -> assignment -> triage -> audit validation | Moderation operator loop works in deployed infrastructure | moderation artifact + ops pack evidence | `green` |
| Protocol recovery drill | `pnpm protocol:recovery:drill` | Inspects manual-verification and queue health, optionally replays dead letters, writes an artifact | Queue/replay health is explainable and protocol-critical blockers are surfaced automatically | `.artifacts/protocol-recovery-drill/*.json` | `green` |
| Incident verification | `pnpm staging:verify:incident` | Checks health, alerts, launch controls, queue visibility, and runbook presence | Incident-readiness surfaces and runbook paths are available | CLI output + staging readiness logs | `conditional` |

## Eval and golden matrix

| Lane | Command / workflow | What it does | What a pass proves | Primary evidence | Status |
| --- | --- | --- | --- | --- | --- |
| Product critical goldens | `pnpm eval:golden:product` | Validates curated required scenarios/checks from suite artifacts | Covered critical product scenarios remain inside the current manifest | eval artifacts under `.artifacts/evals` | `green` in current mainline narrative, but not yet a standalone release gate |
| Full golden runner | `pnpm eval:golden` | Runs social-sim benchmark and product-critical goldens | Covered golden suites are stable against current baselines | eval artifacts under `.artifacts/evals` | `conditional` |
| Live product goldens | `pnpm eval:golden:product:live` | Validates product-critical goldens using live/admin snapshots | Snapshot-backed live evidence still matches the current product contract | eval artifacts under `.artifacts/evals` | `conditional` |
| Replay evals | `pnpm eval:replay` and related commands | Scores replay corpora against expected tool/output behavior | Recorded or synthetic traces still satisfy the current execution contract | replay artifacts under `.artifacts/evals` | `conditional` |
| System Evaluation Matrix | [`.github/workflows/system-live-evals.yml`](/Users/cruciblelabs/Documents/openchat/.github/workflows/system-live-evals.yml) | Runs the live system matrix and baseline comparison | Combined replay/golden/system thresholds pass against staging/live sources | workflows [`24585952832`](https://github.com/TheOpenSocial/openchat/actions/runs/24585952832) and [`24592070223`](https://github.com/TheOpenSocial/openchat/actions/runs/24592070223) + system artifacts | `green` |
| Social simulation benchmark | `pnpm eval:social:benchmark` / `pnpm sim:social*` | Runs deterministic or provider-backed social graph benchmarks | Social simulation corpus still scores inside current expectations | benchmark artifacts under `.artifacts/evals` | `conditional` |

## Sandbox, session, and support automation matrix

| Lane | Command / workflow | What it does | What a pass proves | Primary evidence | Status |
| --- | --- | --- | --- | --- | --- |
| Staging sandbox world | [`.github/workflows/staging-sandbox-world.yml`](/Users/cruciblelabs/Documents/openchat/.github/workflows/staging-sandbox-world.yml) | Creates, inspects, joins, ticks, resets, or validates a sandbox world | Sandbox control plane works and can be scripted from Actions | workflow artifacts | `conditional` |
| Staging sandbox validation | [`.github/workflows/staging-sandbox-validate.yml`](/Users/cruciblelabs/Documents/openchat/.github/workflows/staging-sandbox-validate.yml) | Runs baseline/waiting/activity/stalled-search sandbox scenarios | Sandbox daily-loop scenarios still behave inside the scripted world | workflow [`24251759566`](https://github.com/TheOpenSocial/openchat/actions/runs/24251759566) + artifacts | `green` |
| Staging mobile E2E session | [`.github/workflows/staging-mobile-e2e-session.yml`](/Users/cruciblelabs/Documents/openchat/.github/workflows/staging-mobile-e2e-session.yml) | Boots a smoke session and emits a mobile E2E artifact | Mobile automation can obtain a valid staged session bundle | workflow [`24367635640`](https://github.com/TheOpenSocial/openchat/actions/runs/24367635640) + artifact | `green` |
| Benchmark onboarding | [`.github/workflows/benchmark-onboarding.yml`](/Users/cruciblelabs/Documents/openchat/.github/workflows/benchmark-onboarding.yml) | Runs onboarding-probe latency/quality benchmarks | Onboarding probe path remains callable and benchmarkable | workflow [`23457925557`](https://github.com/TheOpenSocial/openchat/actions/runs/23457925557) | `green` |
| Staging find user | [`.github/workflows/staging-find-user.yml`](/Users/cruciblelabs/Documents/openchat/.github/workflows/staging-find-user.yml) | Queries staging users by email/name/UUID fragment | Operator lookup path to staging DB works on the runner | workflow artifact | `conditional` |

## What is actually working now

These lanes are the current dependable backbone:

- production deploys
- image builds
- backend ops drill
- moderation drill
- protocol recovery drill
- staging mobile E2E session emission
- staging sandbox validation

These lanes exist and are useful, but should be treated as narrower or conditional:

- staging deploy verification
- replay evals
- live product goldens
- social simulation benchmark
- incident verification
- sandbox world utilities

The current hardening step is now mostly complete:

- the workflow now enables live social-sim by default and on the scheduled path
- the workflow now performs an Ollama readiness check before the matrix run
- the workflow now has tolerance-aware baseline comparison for the live provider-backed social-sim lane, and workflow [`24592070223`](https://github.com/TheOpenSocial/openchat/actions/runs/24592070223) confirmed that this clears the last false regression without softening deterministic gates

That means the system is in a good backend/SDK operational state, with both CI and the all-up system eval gate green again.

## How to use this matrix

- For merge confidence, start with `CI`.
- For deploy confidence, use `Build Images` + `Deploy Production`.
- For backend operational confidence, use `Backend Ops Drill`.
- For protocol recovery confidence, inspect the protocol recovery drill artifact inside the backend ops drill.
- For product-quality confidence beyond the backend surface, use the eval lanes, but treat `System Evaluation Matrix` as the current gap until it is green consistently.
- For MVP layer confidence, use [`/Users/cruciblelabs/Documents/openchat/docs/mvp-readiness-matrix.md`](/Users/cruciblelabs/Documents/openchat/docs/mvp-readiness-matrix.md).

## Maintenance rule

If a workflow, command, artifact location, or operational status changes, update this document in the same change.
