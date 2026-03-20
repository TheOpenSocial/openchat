# OpenSocial — State-of-the-Art Technical Architecture (NestJS + TypeScript + OpenAI)

## 1) Executive summary

OpenSocial is **not** a feed product. It is an **intent-routing system**:

1. a user expresses an intent in natural language,
2. the platform interprets that intent,
3. finds compatible users,
4. obtains consent through opt-in outreach,
5. creates a direct human-to-human connection.

The architecture therefore must optimize for:

- low-latency synchronous interactions for the user-facing path,
- durable asynchronous orchestration for enrichment, fanout, retries, and follow-up,
- strong safety/consent controls,
- multi-agent coordination without overfitting everything into a single long prompt,
- first-class observability,
- clean separation between deterministic business logic and model-driven reasoning.

This document defines the recommended production architecture using:

- **TypeScript**
- **NestJS**
- **OpenAI Responses API**
- **OpenAI Agents SDK (TypeScript)**
- **PostgreSQL + pgvector**
- **Redis**
- **BullMQ**
- **WebSockets / realtime gateway**
- **Object storage for media**
- **Google OAuth login**

---

## 2) Architecture principles

### 2.1 Product principles

- **Humans talk to humans.** Agents never impersonate the user in direct chat.
- **Opt-in only.** No unsolicited direct chat creation.
- **Fast first response.** The user should get useful feedback immediately, even if deeper work continues in the background.
- **Intent first, profile second.** Ranking is organized around current intent, not just static profile similarity.
- **Deterministic core, agentic edge.** Use models for interpretation, ranking assistance, copy generation, and recovery. Use deterministic services for permissions, routing, transactions, and state transitions.

### 2.2 Platform principles

- **Responses API is the default AI surface.**
- **Agents SDK is the orchestration layer for multi-agent behavior.**
- **BullMQ is the durable async backbone.**
- **Postgres is the source of truth.**
- **Redis is ephemeral, not authoritative.**
- **pgvector powers online semantic search for users and intents.**
- **RAG is used selectively; not every problem is a retrieval problem.**

---

## 3) Why this stack

### 3.1 OpenAI Responses API

Use the **Responses API** as the primary model interface.

Why:
- It is the recommended interface for new agent-like applications.
- It supports multi-turn state, built-in tools, function calls, structured outputs, and multimodal inputs.
- It is explicitly positioned as agentic by default.

Implication:
- Do **not** build the platform on the legacy Assistants API.
- Use Responses for all new orchestration, extraction, safety-review, enrichment, and messaging-support tasks.

### 3.2 OpenAI Agents SDK (TypeScript)

Use the **Agents SDK** for:
- agent definitions,
- handoffs,
- guardrails,
- tracing,
- shared orchestration semantics.

Why:
- It is the official OpenAI framework for multi-agent workflows.
- It supports specialized agents, tool use, handoffs, streaming, and traces.
- It provides a production-oriented abstraction without forcing a heavy graph framework.

### 3.3 BullMQ + Redis

Use **BullMQ** as the app-level durable orchestration layer.

Why:
- You will need retries, scheduling, fanout, rate limiting, deduplication, delayed jobs, and parent/child workflows.
- BullMQ Flows are a strong fit for multi-step pipelines such as: parse intent -> shortlist candidates -> safety review -> fanout requests -> evaluate acceptances -> open connection.
- Queue events are implemented on Redis Streams, which is better than naive pub/sub for delivery guarantees.

### 3.4 PostgreSQL + pgvector

Use **PostgreSQL** as the source of truth and **pgvector** for semantic retrieval.

Why:
- User, intent, consent, chat, moderation, and analytics state are transactional.
- pgvector keeps embeddings close to relational data and supports exact and approximate nearest-neighbor search.
- This simplifies the system versus adding a separate vector database too early.

### 3.5 Redis

Use Redis for:
- presence,
- session cache,
- rate limits,
- queue backend,
- short-lived matchmaking windows,
- hot ranking caches.

Never rely on Redis as the primary source of truth for:
- profiles,
- permissions,
- match requests,
- chats,
- trust state.

---

## 4) High-level system architecture

```text
[Web / iOS / Android]
        |
        v
[API Gateway / BFF - NestJS]
        |
        +--> [Auth Module]
        +--> [Profile Module]
        +--> [Intent Module]
        +--> [Chat Module]
        +--> [Notification Module]
        +--> [Realtime Gateway]
        +--> [Agent Orchestrator]
        +--> [Search / Match Service]
        +--> [Trust & Safety Service]
        +--> [Media Service]
        |
        +--> [PostgreSQL + pgvector]
        +--> [Redis]
        +--> [BullMQ]
        +--> [Object Storage]
        +--> [OpenAI Responses API / Agents SDK]
```

### 4.1 Recommended deployment split

Use a **modular monolith first**, not microservices.

Recommended runtime units:

1. **API app**
   - NestJS HTTP + WebSocket gateway
   - user-facing endpoints
   - low-latency synchronous flows

2. **Worker app**
   - BullMQ processors
   - enrichment, fanout, reminders, retries, embeddings, moderation, ranking refresh

3. **Realtime app** (optional split once scale demands it)
   - websocket connections
   - presence
   - delivery acknowledgements

4. **Agent runtime module**
   - can live inside the worker app initially
   - isolates OpenAI agent orchestration, traces, and policies

This gives operational clarity without premature distributed-system complexity.

---

## 5) Core user-facing capabilities supported by this architecture

- signup / login with Google
- profile creation and editing
- profile pictures upload and moderation
- interest graph + structured profile data
- natural-language intent submission
- AI parsing of intent into structured form
- semantic + rules-based matchmaking
- consent-based outreach
- direct human-to-human chat
- group formation
- asynchronous fanout and reminders
- profile enrichment over time
- long-term memory and retrieval for better routing
- abuse detection and trust controls
- notifications and real-time updates

---

## 6) Core services/modules

## 6.1 Auth module

Responsibilities:
- Google OAuth login
- session issuance
- refresh token strategy
- device/session management
- account linking
- optional future support for passkeys and additional providers

Recommended approach:
- Google OAuth handled **server-side**
- NestJS auth module with Passport strategy or a direct OAuth implementation
- JWT access tokens + rotating refresh tokens
- session records stored in Postgres

Tables:
- `users`
- `auth_identities`
- `sessions`
- `refresh_tokens`

## 6.2 Profile module

Responsibilities:
- core profile fields
- interests, topics, availability, activity preferences
- profile photos
- profile privacy settings
- profile embedding generation

Notes:
- Keep a normalized structured profile plus a denormalized `profile_search_text` field for embedding.
- Store profile pictures in object storage, not Postgres.
- Queue moderation and image processing after upload.

## 6.3 Intent module

Responsibilities:
- create intent
- parse intent
- attach urgency/time/location hints
- track lifecycle
- start matchmaking flow

Intent states:
- `draft`
- `submitted`
- `parsed`
- `matching`
- `requests_sent`
- `partially_accepted`
- `matched`
- `expired`
- `cancelled`

## 6.4 Search / Match service

Responsibilities:
- candidate retrieval
- semantic similarity search
- rules-based filtering
- reranking
- candidate diversity constraints
- de-duplication / suppression

Scoring inputs:
- intent-topic similarity
- profile-interest similarity
- current availability
- recency of activity
- language compatibility
- geo proximity (if relevant)
- trust/reputation threshold
- prior positive/negative interaction history
- spam resistance / request fatigue limits

## 6.5 Agent orchestrator

Responsibilities:
- call specialized agents via OpenAI Agents SDK
- maintain handoff rules
- guardrails
- tracing
- structured outputs
- fallback behavior

This service should not directly own business state transitions. It should propose or annotate actions; domain services should commit state.

## 6.6 Chat module

Responsibilities:
- create direct chat after mutual consent
- deliver messages in real time
- maintain chat threads
- moderation checks
- block/report flows

Use WebSockets for real-time UX, but persist every authoritative message event in Postgres.

## 6.7 Notification module

Responsibilities:
- in-app notifications
- push notifications
- email fallback
- request accepted / declined / expired signals
- digest/reminder jobs

## 6.8 Trust & safety module

Responsibilities:
- rate limits
- text moderation
- image moderation
- anomaly detection
- user reports
- blocks / mutes
- trust score computation
- enforcement actions

## 6.9 Media module

Responsibilities:
- upload profile images
- virus/image validation
- resize/transcode
- moderation review
- CDN URLs

## 6.10 Presence module

Responsibilities:
- online/offline presence
- last active timestamp
- current availability windows
- ephemeral “open now” state

Redis is appropriate here, with periodic durable snapshots into Postgres if needed.

---

## 7) Multi-agent architecture

Do not start with one giant “social super-agent”.

Use a **small set of specialized agents** with clear contracts.

## 7.1 Recommended agent topology

### A. Intent Parser Agent

Purpose:
- convert raw user text into a strict structured intent object

Example:
Input:
> "I want to talk about last night’s match"

Output:
- type: `chat`
- topics: `[football, match_analysis]`
- urgency: `today`
- group_size: `1`
- tone: `casual`
- constraints: `[]`

Implementation notes:
- use Structured Outputs with strict JSON schema
- reject invalid schema at the API boundary

### B. Matchmaking Analyst Agent

Purpose:
- explain and refine ranking among shortlisted candidates
- produce rationale and soft signals, not final authorization

This agent does not decide who can be contacted. It assists reranking after deterministic retrieval.

### C. Outreach Composer Agent

Purpose:
- generate concise opt-in request copy
- adapt tone by intent category
- enforce brevity and non-creepy language

Example:
> "Jeff wants to talk about last night’s match. Interested?"

### D. Group Formation Agent

Purpose:
- convert multiple candidates into coherent small groups
- ensure topical compatibility and balanced composition

Example:
- poker group of 4
- casual gaming squad
- startup discussion room

### E. Profile Enrichment Agent

Purpose:
- summarize user behavior into safer internal descriptors
- update embeddings / profile facets
- suggest new profile tags for review

### F. Safety Review Agent

Purpose:
- classify risky or boundary-pushing intents
- flag suspicious messaging patterns
- assist moderation queue triage

### G. Memory / Retrieval Agent

Purpose:
- retrieve prior successful interactions, preference drift, and prior exclusions
- provide context to ranking or follow-up flows

## 7.2 Handoff strategy

Recommended pattern:
- Router/Orchestrator invokes specialized agents via explicit handoffs.
- Each agent has a narrow responsibility and a strict output schema.
- The orchestrator never lets agents directly mutate domain state.

Flow example:
1. user submits intent
2. Intent Parser Agent -> structured intent
3. Match Service -> deterministic shortlist
4. Matchmaking Analyst Agent -> rerank annotations
5. Safety Review Agent -> risk pass
6. Outreach Composer Agent -> request copy
7. Notification service fans out requests

## 7.3 Why this is the right level of agentic behavior

This architecture is genuinely agentic, but avoids common failures:
- no single overloaded prompt,
- no hidden direct model writes into critical tables,
- no “AI decides everything” anti-pattern,
- no brittle long-running in-memory loop without durable orchestration.

---

## 8) Agent loop design

The OpenAI Responses API is already agentic by default, but the application still needs an outer orchestration loop.

Use a **two-layer loop**.

### Layer 1 — Model loop
Handled by Responses API / Agents SDK:
- tool calls
- reasoning
- handoffs
- structured outputs
- traces

### Layer 2 — Application loop
Handled by NestJS + BullMQ:
- retries
- durable state transitions
- distributed fanout
- scheduled follow-up
- cancellation
- deduplication
- escalations

Rule:
- the model reasons,
- the application commits.

---

## 9) Synchronous path vs asynchronous path

## 9.1 Synchronous path (user waiting)

Keep the synchronous path tight.

Example: create intent
1. receive raw text
2. call Intent Parser Agent
3. persist parsed intent
4. retrieve top candidates
5. return immediate UI result:
   - "we found 8 possible people"
   - "sending requests to the best 3"
6. enqueue fanout flow

Latency target:
- initial response in low seconds, not tens of seconds

## 9.2 Asynchronous path (worker-driven)

Use BullMQ for:
- fanout requests
- delayed retries
- profile enrichment
- embeddings refresh
- reminder notifications
- candidate backfill if first batch declines
- safety review escalations
- post-chat feedback analysis
- trust score recomputation

Example fanout flow:
- `intent.parse.completed`
  - child: `candidates.fetch`
  - child: `safety.precheck`
  - child: `message.compose`
  - parent: `request.fanout`
  - child: `acceptance.watch`
  - child: `connection.open`

---

## 10) BullMQ design

## 10.1 Queues

Recommended initial queues:
- `intent-queue`
- `match-queue`
- `fanout-queue`
- `chat-queue`
- `profile-queue`
- `safety-queue`
- `notification-queue`
- `analytics-queue`
- `media-queue`

## 10.2 Job types

Examples:
- `parse-intent`
- `generate-intent-embedding`
- `find-candidates`
- `rerank-candidates`
- `compose-outreach`
- `fanout-request`
- `schedule-reminder`
- `open-connection`
- `refresh-profile-embedding`
- `moderate-profile-image`
- `score-feedback`
- `recompute-trust-score`

## 10.3 Flows

Use BullMQ Flows when child jobs must complete before a parent proceeds.

Good use cases:
- intent intake pipeline
- profile image pipeline
- group creation pipeline
- post-interaction scoring pipeline

## 10.4 Idempotency

Every externally visible action must be idempotent:
- request fanout
- push notification send
- chat opening
- trust enforcement
- billing events if introduced later

Store idempotency keys in Postgres.

---

## 11) Data architecture

## 11.1 PostgreSQL as source of truth

Core tables:
- `users`
- `user_profiles`
- `user_profile_photos`
- `auth_identities`
- `user_availability`
- `user_interests`
- `user_embeddings`
- `intents`
- `intent_embeddings`
- `intent_candidate_runs`
- `intent_candidates`
- `match_requests`
- `connections`
- `conversations`
- `messages`
- `message_deliveries`
- `reports`
- `blocks`
- `trust_scores`
- `notifications`
- `agent_runs`
- `agent_events`
- `feedback_events`
- `audit_logs`

## 11.2 pgvector usage

Recommended vectors:
- user profile embedding
- user interest embedding
- intent embedding
- conversation topic summary embedding

Do not put all memory into one giant vector table.

Separate by purpose:
- `user_profile_vectors`
- `intent_vectors`
- `memory_vectors`

## 11.3 Redis usage

Use Redis for:
- presence: `presence:user:{id}`
- availability window cache
- short-lived candidate caches
- request cooldown counters
- websocket session fanout
- BullMQ backend

---

## 12) RAG strategy

RAG is useful here, but it should be **targeted**.

## 12.1 Where RAG is useful

### A. User memory retrieval
- prior successful interactions
- previous accepted / rejected request patterns
- prior user preferences inferred from feedback

### B. Policy retrieval
- trust and safety rules
- moderation decision guidelines
- support playbooks

### C. Product knowledge retrieval
- internal ops docs
- support responses
- admin assistant context

## 12.2 Where RAG is not the primary answer

Do **not** make the core matchmaking path depend on expensive unstructured RAG first.

The online path should be:
- structured profile filters,
- vector similarity search,
- deterministic ranking,
- small model-assisted reranking.

## 12.3 Recommended split

- **pgvector**: online user/intent retrieval
- **OpenAI file search / vector stores**: internal knowledge retrieval for support/admin/operator workflows

---

## 13) Profile system

## 13.1 Structured profile model

Recommended top-level fields:
- display name
- username
- bio
- languages
- city / coarse location
- interests
- topics willing to discuss
- activities willing to do
- availability style
- social energy preference
- privacy settings
- trust signals

## 13.2 Profile embeddings

Generate embeddings from a canonical synthesized text, for example:

```text
User is interested in football, startups, table tennis, and gaming.
Prefers casual conversations and evening availability.
Open to one-on-one chat and small groups.
```

Store:
- raw source text
- embedding version
- embedding vector
- generated_at

## 13.3 Profile pictures

Flow:
1. upload to object storage via signed URL
2. create DB record with `pending_review`
3. media queue resizes and normalizes image
4. moderation queue checks image safety
5. approved image becomes active

Store only metadata in Postgres.

---

## 14) Intent system

## 14.1 Canonical intent schema

```ts
export type IntentType = 'chat' | 'activity' | 'group';
export type IntentUrgency = 'now' | 'today' | 'flexible';

export interface ParsedIntent {
  rawText: string;
  type: IntentType;
  topics: string[];
  activities: string[];
  urgency: IntentUrgency;
  timeWindow?: {
    start?: string;
    end?: string;
  };
  locationHint?: string;
  groupSize?: number;
  tone?: 'casual' | 'focused' | 'competitive' | 'supportive';
  constraints: string[];
  confidence: number;
}
```

## 14.2 Intent parsing contract

Use Structured Outputs so the parser always returns valid schema.

Validation layers:
1. OpenAI structured output validation
2. Zod / TypeBox runtime validation in TypeScript
3. domain-level validation in NestJS service

---

## 15) Matchmaking architecture

## 15.1 Candidate generation

Stage 1 — deterministic retrieval
- availability filter
- locale / language filter
- reputation threshold
- block-list exclusion
- recent fatigue suppression
- semantic similarity via pgvector

Stage 2 — reranking
- combine numerical features
- optional model-assisted reasoning score
- diversity / freshness constraints

Stage 3 — fanout selection
- select top N to contact now
- keep backup pool for later retries

## 15.2 Group formation

For group intents:
- start from compatible candidate pool
- enforce topic coherence
- avoid social collisions (blocked pairs, prior abuse reports, exhausted users)
- create provisional group state
- issue invitations
- open group chat only after enough accepts

---

## 16) Messaging architecture

## 16.1 Message model

Use event-based persistence:
- message created
- delivered
- seen
- edited (optional)
- deleted (soft delete)

## 16.2 Real-time delivery

Recommended:
- NestJS WebSocket gateway
- Redis adapter for horizontal fanout when multiple app instances are used
- Postgres remains the source of truth

## 16.3 Safety in messaging

Run moderation checks:
- pre-send for high-risk users or flagged threads
- async post-send scanning for normal traffic
- report/block flows available in every thread

---

## 17) Trust and safety architecture

This product is social. Trust and safety is not optional.

## 17.1 Baseline protections

- account rate limits
- per-intent fanout caps
- per-day outreach caps
- repeated rejection cooldowns
- account age trust weighting
- content moderation for text and images
- report/block/mute
- suspicious pattern detection

## 17.2 AI safety role

Use OpenAI moderation for baseline text/image checks and dedicated safety-review agent prompts for product-specific policy interpretation.

## 17.3 OpenClaw lesson

OpenClaw is useful as a reference for session-to-session coordination and agent loop ideas, but it is also a cautionary example: recent analysis found significant baseline security weaknesses and poor resistance against adversarial scenarios. Do not adopt unconstrained local-agent patterns blindly for a consumer social product.

Practical implication:
- no unrestricted shell/tool execution,
- no agent-direct database writes,
- no broad ambient permissions,
- all tool invocations go through application authorization.

---

## 18) Authentication and identity

## 18.1 Google login

Recommended first provider:
- Google OAuth 2.0 web server flow

Why first:
- fast onboarding
- high trust
- familiar UX
- good for web and mobile

Implementation guidance:
- handle OAuth server-side,
- store provider identity separately from user profile,
- support account linking later,
- do not rely on browser-only auth logic for backend session security.

## 18.2 Future identity roadmap

- Apple login
- passkeys
- email magic link
- phone auth in selected markets

---

## 19) Observability

## 19.1 Application observability

Use:
- structured logs
- OpenTelemetry traces
- request IDs / correlation IDs
- job IDs / flow IDs
- domain event audit trail

## 19.2 Agent observability

Leverage OpenAI Agents SDK tracing and also persist local agent run metadata:
- run id
- input summary
- output summary
- tool calls
- handoffs
- latency
- token usage
- failure category

## 19.3 Product analytics

Track:
- time to parse
- time to first candidate set
- time to first acceptance
- time to connection
- request acceptance rate
- match quality by intent category
- post-connection satisfaction
- trust/safety incident rates

---

## 20) Reliability patterns

- idempotent workers
- outbox pattern for external notifications
- retries with backoff
- dead-letter queues
- queue saturation alerts
- per-queue concurrency controls
- worker heartbeats
- graceful cancellation for expired intents
- compensation jobs when later stages fail

Examples:
- if request fanout succeeds but connection creation fails, enqueue repair job
- if a group reaches minimum acceptances after one invite expires, recompute membership atomically

---

## 21) Model usage strategy

## 21.1 Main LLM usage categories

1. structured intent parsing
2. reranking assistance
3. outreach copy generation
4. profile enrichment
5. moderation/safety review support
6. memory summarization
7. support/admin copilots

## 21.2 Embeddings

Use embeddings for:
- user profile similarity
- intent similarity
- historical feedback clustering
- semantic retrieval of user memory

## 21.3 When to use background mode

Use OpenAI background mode selectively for:
- long-running enrichments
- heavy profile backfills
- offline analysis pipelines
- admin/operator workflows

Do not make the user-facing critical path depend on long-running background mode. User-facing orchestration still belongs in your app queue system.

---

## 22) Recommended request flow examples

## 22.1 Example A — 1:1 chat intent

User input:
> "I want to talk about yesterday’s match"

Flow:
1. API receives request
2. Intent Parser Agent returns structured intent
3. intent stored in Postgres
4. intent embedding generated
5. Match service fetches candidate pool from pgvector + structured filters
6. Safety service removes ineligible candidates
7. Matchmaking Analyst Agent reranks top 20
8. fanout job created for top 3
9. Notification service sends opt-in requests
10. if accepted -> connection created -> chat thread opened
11. if all decline -> worker pulls backup candidates

## 22.2 Example B — group intent

User input:
> "Need 4 people for poker tonight"

Flow:
1. parse intent
2. determine target group size
3. retrieve candidate pool
4. Group Formation Agent proposes balanced set
5. fanout invitations
6. once threshold met -> group conversation opened
7. reminder jobs scheduled before start time

## 22.3 Example C — profile enrichment

1. user completes several chats
2. feedback events collected
3. nightly enrichment job summarizes successful patterns
4. profile facets and embeddings refreshed
5. future matchmaking improves

---

## 23) Suggested repository structure

```text
apps/
  api/
  worker/
  realtime/
packages/
  domain/
  database/
  auth/
  agents/
  openai/
  queues/
  messaging/
  matching/
  safety/
  observability/
  shared/
infra/
  docker/
  terraform/
  kubernetes/
docs/
  product/
  architecture/
  runbooks/
```

### 23.1 Inside `packages/agents`

```text
packages/agents/
  intent-parser/
  matchmaking-analyst/
  outreach-composer/
  group-formation/
  profile-enrichment/
  safety-review/
  memory-retrieval/
  schemas/
  prompts/
  tools/
```

---

## 24) Recommended implementation phases

## Phase 1 — Strong MVP foundation

Ship:
- Google login
- profile creation
- profile pictures
- natural-language intents
- structured parsing
- 1:1 consent-based matching
- direct chat
- baseline moderation
- basic analytics

## Phase 2 — Better routing and trust

Add:
- richer profile facets
- better embeddings/reranking
- trust score system
- delayed retries and backup candidate logic
- profile enrichment jobs
- push notifications

## Phase 3 — Group intelligence

Add:
- group formation
- small-group conversations
- scheduled activities
- follow-ups and reminders

## Phase 4 — Full agentic quality

Add:
- multi-agent handoff orchestration
- deeper memory retrieval
- personalized re-engagement
- operator/admin copilots
- richer safety review and policy tooling

---

## 25) Key decisions summary

### Choose this
- NestJS modular monolith
- OpenAI Responses API for all new model work
- OpenAI Agents SDK for agent definitions, handoffs, traces, guardrails
- BullMQ + Redis for durable async orchestration
- Postgres as system of record
- pgvector for online semantic retrieval
- object storage for profile media
- WebSockets for real-time chat and request updates
- Google OAuth first

### Avoid this
- legacy Assistants-first architecture
- one giant agent prompt owning everything
- microservices too early
- separate vector DB too early
- Redis as source of truth
- agent-direct writes to critical domain state
- unconstrained OpenClaw-like permission models

---

## 26) Bottom line

The right architecture for OpenSocial is:

- **OpenAI-native for intelligence**,
- **NestJS-native for application structure**,
- **BullMQ-native for durable orchestration**,
- **Postgres-native for truth and consistency**,
- **Redis-native for speed and ephemeral coordination**.

The product succeeds if the platform can do four things reliably:

1. understand intent,
2. find the right people,
3. obtain consent cleanly,
4. open a real human interaction fast.

Everything in this architecture is optimized around that.

---

## 27) Source notes used for this architecture

- OpenAI recommends the Responses API for new agent-like applications and describes it as the unified, agentic interface.
- The OpenAI Agents SDK supports specialized agents, handoffs, tools, streaming, and tracing.
- OpenAI background mode is intended for long-running asynchronous model tasks, but it should complement rather than replace app-level orchestration.
- BullMQ Flows support parent/child workflows; QueueEvents use Redis Streams for more durable event delivery semantics than simple pub/sub.
- pgvector supports exact and approximate nearest-neighbor search directly in Postgres.
- Google documents the server-side OAuth 2.0 web flow and recommends using OAuth libraries for correctness.
- OpenClaw is a useful reference for agent/session coordination patterns, but recent security research reports weak baseline defenses and high susceptibility to adversarial behavior.

