# 06 — AI Agent Architecture

## Goal
Use AI where it materially improves understanding, ranking, summarization, and safety. Keep final state transitions deterministic and application-owned.

## Foundation
Use the OpenAI Responses API as the main model interface and the OpenAI Agents SDK for agent composition, handoffs, and tracing where multi-agent orchestration is justified.

## Agentic design principle
Agentic behavior is bounded inside a workflow:
- planner suggests
- tools gather
- policies gate
- application decides
- workers execute
- state writes stay deterministic

## Proposed agent topology

### 1. Intent Parsing Agent
Input:
- raw user text
- locale
- optional user context

Output:
- strict JSON schema with:
  - intent_type
  - topics
  - activities
  - urgency
  - location hints
  - privacy sensitivity
  - unsafe / disallowed flags
  - confidence

This agent must use Structured Outputs.

### 2. Candidate Enrichment Agent
Input:
- parsed intent
- candidate metadata
- recent interaction context

Output:
- lightweight relevance rationale
- optional feature enrichments
- never final rank alone

### 3. Routing Policy Agent
Purpose:
- decide request fanout strategy under policy constraints
- e.g. first wave size, diversity, cooldown enforcement
- still advisory; app enforces limits

### 4. Safety Review Agent
Purpose:
- classify risky intents
- detect harassment, sexual content, coercion, scams, self-harm signals, illegal requests
- escalate to deterministic policy engine / human review

### 5. Summary Agent
Purpose:
- summarize routing status for user-facing updates
- summarize conversation outcomes for internal analytics only if allowed by policy

## Non-goals
- no autonomous tool sprawl
- no unrestricted shell/browser/file execution in prod
- no agent direct writes to core DB
- no fully autonomous outbound socializing

## Handoffs
Use agent handoffs only inside a bounded orchestration layer:
intent parser -> safety -> routing policy -> application service

## Prompt management
Prompts must be:
- versioned
- tested
- locale-aware
- stored in repo
- checksum-tracked
- rollbackable

## Tool use
Allowed tools should be narrowly scoped internal service functions:
- fetch_user_profile_summary
- fetch_candidate_pool
- fetch_trust_features
- create_routing_plan_proposal
- classify_content_policy
No general-purpose environment tools in prod.

## Failure handling
If AI fails:
- fall back to deterministic parser/rules where possible
- mark low confidence
- do not silently create unsafe or low-quality requests
- require human-edit/confirm path for ambiguous intents

## Cost policy
- cheap parser path for most intents
- expensive reasoning path only for ambiguity, edge safety, or complex group coordination
- embeddings reused aggressively
