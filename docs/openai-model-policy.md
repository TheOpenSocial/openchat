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
| `intent_parsing` | `OPENAI_MODEL_INTENT_PARSING` | `gpt-4.1-mini` |
| `follow_up_question` | `OPENAI_MODEL_FOLLOW_UP_QUESTION` | `gpt-4.1-mini` |
| `suggestion_generation` | `OPENAI_MODEL_SUGGESTION_GENERATION` | `gpt-4.1-mini` |
| `ranking_explanation` | `OPENAI_MODEL_RANKING_EXPLANATION` | `gpt-4.1-mini` |
| `notification_copy` | `OPENAI_MODEL_NOTIFICATION_COPY` | `gpt-4.1-mini` |
| `moderation_assist` | `OPENAI_MODEL_MODERATION_ASSIST` | `gpt-4.1-mini` |

## Release gate

- Any model change must update this file and pass:
  - `apps/api/test/openai-client.spec.ts`
  - full root verification suite (`lint`, `typecheck`, `test`, `db:drift-check`)
