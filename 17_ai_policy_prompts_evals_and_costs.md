# 17 — AI Policy, Prompts, Evals, and Costs

## Prompt architecture
Prompts live in repo under version control:
- system prompts
- tool instructions
- schemas
- classification prompts
- test fixtures

## Prompt rules
- minimal
- explicit
- no hidden policy in app code only
- locale-aware
- avoid open-ended creative behavior for parsing tasks

## Structured Outputs
Intent parsing and safety classification should use strict JSON schemas. Invalid output is a hard failure, not “best effort”.

## Evals
Build eval sets for:
- intent parsing accuracy
- ambiguity handling
- safety classification
- policy escalation
- multilingual intent parsing
- request-summary quality

## Evaluation sources
- synthetic intents
- manually labeled real user samples
- adversarial prompts
- regression fixtures

## Cost policy
### Budget controls
- budget per 1k routed intents
- max expensive-model calls per request
- fallback tiers
- caching of embeddings and repeated parse artifacts

### Routing tiers
- Tier 1: deterministic/rule + cheap parser
- Tier 2: standard parser model
- Tier 3: advanced reasoner only for ambiguous or complex cases

## Background tasks
For long-running model work, background mode can be used selectively, but application durability still lives in BullMQ.

## Model outage plan
- degrade to deterministic parsing where possible
- hold non-critical workflows
- surface transparent status to user if required
