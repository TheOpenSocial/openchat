# OpenAI Model Policy By Task

This document defines the runtime model-routing policy used by `@opensocial/openai`.

## Resolution order

For each task, model selection resolves in this order:
1. explicit `modelRouting` override passed to `OpenAIClient`
2. task-specific environment variable `OPENAI_MODEL_<TASK>`
3. shared fallback `OPENAI_DEFAULT_MODEL`
4. hard default in code (`gpt-4.1-mini`)

## Task policy

| Task | Task-specific env var | Default |
| --- | --- | --- |
| `onboarding_fast_pass` | `OPENAI_MODEL_ONBOARDING_FAST_PASS` | `gpt-4.1-mini` |
| `onboarding_inference` | `OPENAI_MODEL_ONBOARDING_INFERENCE` | `gpt-4.1-mini` |
| `intent_parsing` | `OPENAI_MODEL_INTENT_PARSING` | `gpt-4.1-mini` |
| `follow_up_question` | `OPENAI_MODEL_FOLLOW_UP_QUESTION` | `gpt-4.1-mini` |
| `suggestion_generation` | `OPENAI_MODEL_SUGGESTION_GENERATION` | `gpt-4.1-mini` |
| `ranking_explanation` | `OPENAI_MODEL_RANKING_EXPLANATION` | `gpt-4.1-mini` |
| `notification_copy` | `OPENAI_MODEL_NOTIFICATION_COPY` | `gpt-4.1-mini` |
| `moderation_assist` | `OPENAI_MODEL_MODERATION_ASSIST` | `gpt-4.1-mini` |

## Onboarding runtime routing policy

Onboarding runtime in `apps/api` resolves model + timeout with an explicit fast/rich split:

1. request-level `modelOverride` (probe/runtime input)
2. candidate hashes from `ONBOARDING_LLM_FAST_MODEL_CANDIDATES` / `ONBOARDING_LLM_RICH_MODEL_CANDIDATES`
3. task defaults `ONBOARDING_LLM_FAST_MODEL` / `ONBOARDING_LLM_RICH_MODEL`
4. shared fallback `ONBOARDING_LLM_MODEL`
5. code fallback `gpt-4.1-mini`

Timeout budgets:
- fast: `ONBOARDING_LLM_TIMEOUT_MS` (default `4000`)
- rich: `ONBOARDING_LLM_RICH_TIMEOUT_MS` (default `15000`, never below fast timeout)

Benchmark quality/latency gates:
- `ONBOARDING_BENCH_MAX_FAILURE_RATE` (default `0.20`)
- `ONBOARDING_BENCH_MAX_P95_MS` (default `4000`)
- `ONBOARDING_BENCH_MIN_QUALITY_SCORE` (default `0.72`)
- `ONBOARDING_BENCH_MAX_GENERIC_PERSONA_RATE` (default `0.30`)

## Release gate

- Any model change must update this file and pass:
  - `apps/api/test/openai-client.spec.ts`
  - full root verification suite (`lint`, `typecheck`, `test`, `db:drift-check`)
