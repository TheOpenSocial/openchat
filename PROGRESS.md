# OpenSocial — Master Implementation Plan

This file is the execution source of truth for coding agents.
It is organized as a production-grade build checklist with:
- epics
- concrete tasks
- dependencies
- acceptance criteria
- implementation notes

## Status Legend
- [ ] not started
- [~] in progress
- [x] complete
- [!] blocked / needs decision

## Verification Checklist
- [x] `pnpm format:check`
- [x] `pnpm lint`
- [x] `pnpm typecheck`
- [x] `pnpm test`
- [x] `pnpm db:drift-check`

Last verified: 2026-03-19

## Implementation Notes
- 2026-03-19: Completed milestone `0.1 Configure shared linting and formatting` by replacing placeholder lint scripts with real ESLint runs across apps/packages, adding a shared flat ESLint config (`@eslint/js` + `typescript-eslint`), and normalizing source formatting with Prettier.
- 2026-03-19: Completed migration foundation updates for `1.1 Add migration and seeding scripts` and `3.1 Add migration pipeline` by adding `prisma/migrations/20260319_init/migration.sql`, committing `migration_lock.toml`, and introducing deterministic migrate/status/validation scripts at root and API package levels.
- 2026-03-19: Completed milestones `2.1 Define websocket event payload types` and `2.2 Add zod or valibot schemas for all externally visible payloads` by centralizing HTTP/WebSocket contract schemas in `@opensocial/types`, wiring all API controllers through shared runtime validation with consistent 400 responses, and enforcing typed socket payload validation in `RealtimeGateway` with new contract coverage tests.
- 2026-03-19: Completed milestone `3.1 Add DB lint / drift checks in CI` by adding `pnpm db:drift-check` to `.github/workflows/ci.yml` so schema validation runs on every push/PR.
- 2026-03-19: Completed milestones `3.2`, `3.3`, and `3.4` database gaps by adding new Prisma models/migration tables for `user_topics`, `user_availability_windows`, `inferred_preferences`, `explicit_preferences`, `preference_feedback_events`, archive tables for chat/audit retention, and new ANN + partial hot-path indexes (HNSW with IVFFlat fallback). Added migration contract tests and retention strategy documentation.

---

## 0. Repo and Governance

### 0.1 Monorepo setup
- [x] Create monorepo structure
  - apps/api
  - apps/web
  - apps/admin
  - packages/ui
  - packages/types
  - packages/config
  - packages/eslint-config
  - packages/tsconfig
  - packages/openai
  - packages/testing
  - docs
- [x] Configure pnpm workspaces
- [x] Configure Turborepo or Nx
- [x] Configure shared TypeScript project references
- [x] Configure shared linting and formatting
- [x] Configure commit hooks (lint-staged, husky)
- [x] Configure CI baseline

**Acceptance criteria**
- `pnpm install` works from root
- `pnpm lint`, `pnpm typecheck`, `pnpm test` work from root
- Shared imports resolve cleanly across apps/packages

### 0.2 Engineering standards
- [x] Add root README with repo commands
- [x] Add CODEOWNERS
- [x] Add branch strategy / release notes process
- [x] Add environment variable policy
- [x] Add error handling conventions
- [x] Add logging conventions
- [x] Add naming conventions for jobs/events/tools

**Acceptance criteria**
- New agents can start work without guessing repo structure or command conventions

---

## 1. Infrastructure and Environments

### 1.1 Local development stack
- [x] Create `docker-compose.yml` for:
  - PostgreSQL
  - Redis
  - MinIO or local S3-compatible storage
  - Mailhog or equivalent
- [x] Seed local development config
- [x] Add migration and seeding scripts
- [x] Add local OpenTelemetry collector optional setup

### 1.2 Cloud environments
- [ ] Define staging environment topology
- [ ] Define production environment topology
- [x] Define secrets management approach
- [x] Define object storage provider
- [x] Define CDN strategy for media
- [ ] Define websocket ingress / sticky session strategy
- [ ] Define database backup and restore policy
- [ ] Define Redis persistence/failover strategy

### 1.3 Deployment
- [x] Create Dockerfiles for api/web/admin
- [x] Add CI build pipelines
- [ ] Add staging deploy pipeline
- [ ] Add production deploy pipeline
- [ ] Add migration step to deployment flow
- [ ] Add rollback strategy

**Acceptance criteria**
- Fresh environment can be provisioned and deployed end-to-end
- Staging deploy is repeatable and rollbackable

---

## 2. Shared Domain Types and Contracts

### 2.1 Shared packages
- [x] Create `packages/types`
- [x] Define core enums:
  - IntentType
  - IntentUrgency
  - RequestStatus
  - ConnectionType
  - ChatType
  - NotificationType
  - ModerationStatus
  - UserAvailabilityMode
- [x] Define shared DTOs and zod schemas
- [x] Define API response envelopes
- [x] Define websocket event payload types
- [x] Define BullMQ job payload types

### 2.2 Schema validation
- [x] Add zod or valibot schemas for all externally visible payloads
- [x] Add runtime validation for queue payloads
- [x] Add versioning field where needed for long-lived contracts

**Acceptance criteria**
- No cross-service payload is untyped or unvalidated

---

## 3. Database Foundation

### 3.1 ORM and migrations
- [x] Choose and configure ORM/query layer (Prisma, Drizzle, or TypeORM)
- [x] Add migration pipeline
- [x] Add seed pipeline
- [x] Add DB lint / drift checks in CI

### 3.2 Core schema
- [x] users
- [x] user_profiles
- [x] user_profile_images
- [x] user_interests
- [x] user_topics
- [x] user_preferences
- [x] user_rules
- [x] user_availability_windows
- [x] agent_threads
- [x] agent_messages
- [x] intents
- [x] intent_candidates
- [x] intent_requests
- [x] request_responses
- [x] connections
- [x] connection_participants
- [x] chats
- [x] chat_memberships
- [x] chat_messages
- [x] message_receipts
- [x] notifications
- [x] moderation_flags
- [x] user_reports
- [x] blocks
- [x] audit_logs
- [x] outbox_events
- [x] admin_actions

### 3.3 Personalization / life graph schema
- [x] life_graph_nodes
- [x] life_graph_edges
- [x] inferred_preferences
- [x] explicit_preferences
- [x] preference_feedback_events
- [x] retrieval_documents
- [x] retrieval_chunks
- [x] embeddings table(s)

### 3.4 Indexing and performance
- [x] Add transactional indexes for hot paths
- [x] Add pgvector extension
- [x] Add HNSW/IVFFlat indexes where appropriate
- [x] Add partial indexes for active intents and pending requests
- [x] Add retention/archive strategy for chat and logs

**Acceptance criteria**
- Schema covers all product surfaces
- All hot-path queries have explicit indexing strategy
- Migrations run cleanly from zero

---

## 4. Auth, Identity, and Sessions

### 4.1 Authentication
- [~] Implement Google OAuth login
- [x] Add email/password fallback decision doc or explicitly exclude
- [~] Add JWT/session strategy
- [~] Add refresh token flow
- [ ] Add device/session management

### 4.2 Identity and onboarding
- [ ] Create user bootstrap flow
- [~] Create onboarding status state machine
- [ ] Add profile completion checks
- [ ] Add username/handle strategy if needed
- [ ] Add profile visibility settings

### 4.3 Security hardening
- [ ] Add CSRF protection if cookie-based
- [ ] Add session revocation
- [ ] Add suspicious login detection hooks
- [ ] Add audit log on auth events

**Acceptance criteria**
- User can sign in with Google, onboard, persist session, and sign out safely

---

## 5. Profile and Media System

### 5.1 Profiles
- [~] Profile CRUD API
- [ ] Interests/topics management
- [ ] Availability preferences editing
- [ ] Social mode settings
- [ ] Intent-type-specific preferences

### 5.2 Profile photos
- [ ] Direct upload flow
- [ ] Image validation
- [ ] Resize/thumbnail pipeline
- [ ] Moderation pipeline for images
- [ ] CDN delivery URLs
- [ ] Avatar fallback generation

### 5.3 Trust profile
- [ ] Verification badges strategy
- [ ] Reputation score display rules
- [ ] Safety labels / account freshness rules

**Acceptance criteria**
- User can fully manage profile and photo without breaking moderation or media processing rules

---

## 6. Agent Chat Surface

### 6.1 Agent thread model
- [~] Create agent thread persistence
- [~] Create agent message persistence
- [~] Distinguish user messages, agent messages, system updates, and async workflow updates

### 6.2 Agent UI API
- [x] POST message to agent thread
- [x] GET thread history
- [ ] Stream agent response support
- [ ] Background update delivery into same thread

### 6.3 Agent behavior baseline
- [ ] Agent acknowledges intent naturally
- [ ] Agent stores request durably
- [ ] Agent can follow up later:
  - “I found 3 people for Apex”
  - “Remember you asked earlier…”
- [ ] Agent can summarize pending states
- [ ] Agent can cancel outstanding intent flow

**Acceptance criteria**
- User can have an ongoing “social agent” conversation that persists over time
- Async job results appear as natural agent follow-ups

---

## 7. OpenAI Integration Layer

### 7.1 SDK foundation
- [x] Create `packages/openai`
- [x] Add OpenAI client wrapper
- [~] Add model routing config
- [x] Add retry/backoff and timeout policy
- [~] Add tracing correlation IDs

### 7.2 Structured Outputs
- [x] Implement intent parsing schema
- [x] Implement follow-up question schema
- [ ] Implement suggestion schema
- [ ] Implement ranking explanation schema

### 7.3 Agents SDK / AgentKit alignment
- [ ] Define manager agent
- [ ] Define specialist sub-agents:
  - intent parser agent
  - ranking explanation agent
  - personalization interpreter agent
  - notification copy agent
  - moderation assistant agent
- [ ] Define handoff/tool policy
- [ ] Define human-in-the-loop approvals for risky actions
- [ ] Define background run policy

### 7.4 Evaluation and prompt lifecycle
- [ ] Prompt versioning
- [ ] Golden intent parsing dataset
- [ ] Regression tests for tool usage
- [ ] Failure capture and replay

**Acceptance criteria**
- All AI calls go through a shared typed layer
- Intent parsing is schema-safe
- Prompt/model/tool changes are testable

---

## 8. Intent Ingestion and Understanding

### 8.1 Intent creation
- [x] Create POST /intents from explicit API
- [ ] Create “intent via agent message” flow
- [x] Create intent lifecycle states:
  - draft
  - parsed
  - matching
  - fanout
  - partial
  - connected
  - expired
  - cancelled

### 8.2 Intent parsing
- [ ] Extract:
  - type
  - topic(s)
  - urgency
  - modality (online/offline)
  - group size target
  - timing constraints
  - skill/vibe constraints
- [x] Add fallback heuristic parser if model fails
- [x] Add parser confidence score
- [x] Add follow-up question path for ambiguous input

### 8.3 Intent management
- [x] Edit intent
- [x] Cancel intent
- [x] Retry intent
- [x] Widen intent filters
- [ ] Convert 1:1 to group or vice versa

**Acceptance criteria**
- A freeform user message can reliably become a stored structured intent

---

## 9. Personalization, Rules, and Life Graph

### 9.1 Explicit user rules
- [ ] Global rules:
  - who can contact me
  - when I’m reachable
  - 1:1 vs group preference
  - online vs offline
  - language preferences
  - verification requirements
- [ ] Intent-type overrides
- [ ] Notification rules
- [ ] Agent autonomy rules
- [ ] Memory preferences

### 9.2 Life graph
- [ ] Build node types:
  - activity
  - topic
  - game
  - person
  - schedule preference
  - location cluster
- [ ] Build edge types:
  - likes
  - avoids
  - prefers
  - recently engaged with
  - high success with
- [ ] Weight update strategy from feedback and behavior
- [ ] Explicit vs inferred separation

### 9.3 Retrieval / RAG
- [ ] Store retrievable profile summary docs
- [ ] Store preference memory docs
- [ ] Store interaction summaries
- [ ] Build retrieval pipeline for personalization-aware reasoning
- [ ] Guard against stale or unsafe retrieved data

### 9.4 Policy engine
- [~] Build rule precedence engine:
  1. safety rules
  2. hard user rules
  3. product policy
  4. intent-specific overrides
  5. learned preferences
  6. ranking heuristics
- [ ] Build explainability output for debug/admin

**Acceptance criteria**
- Matching and notifications respect explicit user rules before ranking
- Life graph evolves from usage and feedback

---

## 10. Embeddings and Candidate Retrieval

### 10.1 Embedding generation
- [ ] User profile embeddings
- [ ] Interest/topic embeddings
- [ ] Intent embeddings
- [ ] Optional conversation summary embeddings

### 10.2 Retrieval pipeline
- [~] Candidate retrieval by semantic similarity
- [ ] Filter by hard constraints before/after ANN retrieval as designed
- [ ] Add fallback lexical/topic filters
- [ ] Add retrieval score logging

### 10.3 Re-ranking
- [ ] Availability score
- [ ] Trust/reputation score
- [ ] Recent interaction suppression
- [ ] Proximity score for offline
- [ ] Style/vibe compatibility score
- [ ] Personalization boosts

**Acceptance criteria**
- Candidate retrieval is fast, explainable, and policy-compliant

---

## 11. Matching and Routing Engine

### 11.1 1:1 matching
- [x] Top-N candidate selection
- [~] Fanout cap logic
- [x] Duplicate suppression
- [x] Recent rejection suppression

### 11.2 Group formation
- [x] Target group size support
- [x] Hard max participants = 4
- [~] Threshold logic for group creation
- [ ] Backfill if someone drops before start
- [ ] Stop inviting once capacity reached
- [ ] Group conversion rules from active 1:1 intent

### 11.3 Async routing behavior
- [ ] Persist routing attempt history
- [ ] Retry delayed candidates
- [ ] Escalate/widen filters after timeout
- [ ] Notify user naturally about progress and outcomes

### 11.4 Explanations
- [ ] Store why a candidate was selected
- [ ] Expose safe explanation to admin/debug tools
- [ ] Optional user-facing explanation later

**Acceptance criteria**
- Routing works for both 1:1 and <=4-person group intents without over-inviting or violating policy

---

## 12. BullMQ Workflow Orchestration

### 12.1 Queue setup
- [x] Create queues:
  - intent-processing
  - embedding
  - matching
  - request-fanout
  - notification
  - connection-setup
  - moderation
  - media-processing
  - cleanup
  - digests
  - admin-maintenance

### 12.2 Flows
- [~] IntentCreated flow
  - parse intent
  - embed intent
  - retrieve candidates
  - rank candidates
  - fanout requests
- [x] RequestAccepted flow
  - update intent state
  - decide 1:1 vs group
  - create connection/chat
  - notify participants
- [~] GroupFormation flow
  - accumulate acceptances
  - enforce capacity
  - create chat when ready
- [ ] AsyncAgentFollowup flow
  - write agent update
  - send push/inbox update

### 12.3 Reliability
- [ ] Idempotency keys on jobs
- [ ] Exponential backoff
- [ ] Dead-letter handling
- [ ] Manual replay tooling
- [ ] Stalled job recovery
- [ ] Outbox relay integration

**Acceptance criteria**
- All core product flows are durable and replayable
- Side effects are idempotent

---

## 13. Notifications and Agent Follow-ups

### 13.1 Notification types
- [x] Incoming request
- [x] Request accepted
- [ ] Group formed
- [x] Agent update
- [ ] Reminder
- [ ] Digest
- [ ] Moderation/safety notice

### 13.2 Delivery channels
- [x] In-app inbox
- [ ] Push notifications
- [ ] Email digest (optional phased)
- [~] Agent-thread message insertion

### 13.3 Natural-language updates
- [ ] “I found 3 people to play Apex”
- [ ] “Remember you asked me earlier…”
- [ ] “Nobody matched yet; want me to widen filters?”
- [~] “2 people accepted, one more needed”

### 13.4 Notification policy
- [x] Respect quiet hours
- [x] Respect digest mode
- [x] Priority routing by urgency
- [x] Deduplicate updates

**Acceptance criteria**
- Async outcomes always come back to the user in a natural and coherent way
- Notification behavior respects personalization rules

---

## 14. Inbox and Request Handling

### 14.1 Incoming requests
- [x] List pending requests
- [x] Accept/reject
- [x] Expire automatically
- [ ] Bulk decline / snooze behavior if needed later

### 14.2 Request states
- [x] Pending
- [x] Accepted
- [x] Rejected
- [x] Expired
- [x] Cancelled by originator

### 14.3 UX/API requirements
- [ ] Request card summary
- [ ] Who + what + when
- [ ] Maybe why me? internal field for future

**Acceptance criteria**
- Incoming social opportunities are easy to review and act on

---

## 15. Human Chat System

### 15.1 1:1 chat
- [x] Create chat on mutual acceptance
- [x] Membership persistence
- [x] Message persistence
- [x] Read receipts
- [x] Typing indicators
- [ ] Soft-delete behavior
- [ ] Block-aware sending restrictions

### 15.2 Group chat
- [~] Create group chat when threshold met
- [x] Participant cap = 4
- [ ] Membership events
- [ ] Group metadata
- [ ] Participant leave handling
- [ ] Close/archive semantics

### 15.3 Message model
- [x] Text messages
- [ ] System messages
- [ ] Join/leave notices
- [ ] Moderation-hidden messages
- [ ] Message status model

### 15.4 Synchronization
- [x] Pagination
- [ ] Reconnect sync
- [ ] Unread counts
- [ ] Ordering guarantees
- [ ] Deduplication

**Acceptance criteria**
- 1:1 and small group chat are reliable, real-time, and recoverable after reconnect

---

## 16. Realtime Transport

### 16.1 Socket.IO / NestJS gateways
- [x] Authenticated socket connection
- [x] Namespace strategy
- [x] Room strategy for chats and user channels
- [x] Heartbeat / presence handling
- [ ] Reconnection handling

### 16.2 Scaling
- [ ] Redis adapter
- [ ] Sticky session deployment support
- [ ] Multi-node event propagation
- [ ] Fallback sync from DB on reconnect

### 16.3 Protocol semantics
- [ ] Client-generated temp ids or server ids
- [x] Ack events
- [ ] Exactly-once UX via idempotent insert + dedupe
- [ ] Ordering guarantees
- [ ] Offline event replay window

**Acceptance criteria**
- Realtime messaging works across multiple app nodes without inconsistent chat state

---

## 17. Moderation and Safety

### 17.1 Intent moderation
- [ ] Moderate new intents before fanout
- [ ] Block harmful/abusive intents
- [ ] Human review path for uncertain cases

### 17.2 Chat moderation
- [ ] Pre-send moderation policy decision
- [ ] Post-send reporting pipeline
- [ ] Auto-hide/escalate policy
- [ ] Strikes / enforcement model

### 17.3 Profile moderation
- [ ] Text fields moderation
- [ ] Profile image moderation
- [ ] Impersonation reporting

### 17.4 User safety controls
- [x] Block user
- [x] Report user
- [ ] Restrict offline-only users
- [ ] Verified-only mode
- [ ] Age/location/privacy safeguards if applicable

**Acceptance criteria**
- The platform can safely prevent or respond to harmful content and bad actors

---

## 18. Admin Dashboard and Debugging Tools

### 18.1 Admin auth and RBAC
- [ ] Admin roles
- [ ] Support roles
- [ ] Moderation roles
- [ ] Audit all admin actions

### 18.2 Admin views
- [ ] Users
- [ ] Intents
- [ ] Requests
- [ ] Connections
- [ ] Chats
- [ ] Reports
- [ ] Moderation queue
- [ ] Queue/Job monitor
- [ ] Agent traces
- [ ] Audit logs

### 18.3 Superpowers
- [ ] Force-cancel intent
- [ ] Deactivate account
- [ ] Shadow-ban / restrict account
- [ ] Replay workflow
- [ ] Inspect routing explanation
- [ ] Inspect personalization rules
- [ ] Inspect life graph summary
- [ ] Resend notification
- [ ] Repair stuck connection/chat flow

### 18.4 Tooling integration
- [ ] bull-board or equivalent
- [ ] Trace viewer integration
- [ ] Internal query/debug helpers

**Acceptance criteria**
- Support/admin teams can debug user issues and stuck workflows without database spelunking

---

## 19. Search, Discovery, and Suggestions

### 19.1 Passive discovery
- [ ] “What can I do tonight?”
- [ ] Suggested active intents or users
- [ ] Suggested groups
- [ ] Suggested reconnects

### 19.2 Recommendation surfaces
- [ ] Lightweight recommendations in agent thread
- [ ] Inbox suggestions
- [ ] Optional dedicated discovery tab later

### 19.3 Ranking
- [ ] Combine life graph + semantic + policy + recency

**Acceptance criteria**
- Users can get useful discovery without turning the product into a noisy feed

---

## 20. Client Apps

### 20.1 Mobile app
- [ ] Auth flow
- [ ] Onboarding
- [ ] Home/agent
- [ ] Inbox
- [ ] Chats
- [ ] Profile
- [ ] Notifications
- [ ] Settings and personalization

### 20.2 Web app
- [ ] Parity for core flows or explicit reduced surface
- [x] Admin dashboard separate app or route group
- [ ] Responsive layouts

### 20.3 Design system
- [x] Tokens
- [ ] Typography
- [ ] Color roles
- [ ] Chat components
- [ ] Card components
- [ ] Empty/loading/error states

**Acceptance criteria**
- End users can complete full core flows on primary client(s)
- Admin app supports support/debug workflows

---

## 21. Analytics, Experiments, and Product Telemetry

### 21.1 Event tracking
- [ ] Auth events
- [ ] Onboarding completion
- [ ] Intent created
- [ ] Request sent
- [ ] Request accepted/rejected
- [ ] Connection created
- [ ] Chat started
- [ ] First message sent
- [ ] Message replied
- [ ] Report/block
- [ ] Personalization change

### 21.2 Core metrics
- [ ] Time from intent to first acceptance
- [ ] Time from intent to first message
- [ ] Connection success rate
- [ ] Group formation completion rate
- [ ] Notification-to-open rate
- [ ] Repeat connection rate
- [ ] Moderation incident rate

### 21.3 Experimentation
- [ ] Ranking experiment hooks
- [ ] Copy experiment hooks
- [ ] Notification timing experiment hooks
- [ ] Safe rollout guardrails

**Acceptance criteria**
- Product decisions can be made from event data, not anecdote

---

## 22. Observability and Ops

### 22.1 Logs
- [ ] Structured logs everywhere
- [ ] Request correlation ids
- [ ] Job correlation ids
- [ ] User-safe redaction policy

### 22.2 Metrics
- [ ] API latency
- [ ] Websocket connection counts
- [ ] Queue lag
- [ ] Job failure rates
- [ ] DB latency
- [ ] OpenAI latency/cost
- [ ] Moderation rates
- [ ] Push delivery success

### 22.3 Tracing
- [ ] OpenTelemetry in API/workers
- [ ] OpenAI Agents SDK traces linked to app trace ids
- [ ] Trace propagation through jobs/events

### 22.4 Alerts
- [ ] Queue stalled
- [ ] Queue backlog high
- [ ] Websocket error spike
- [ ] DB connection saturation
- [ ] OpenAI error spike
- [ ] Moderation backlog high

**Acceptance criteria**
- Ops can detect, trace, and resolve production issues quickly

---

## 23. Security, Privacy, and Compliance

### 23.1 Security
- [ ] Threat model doc implementation
- [ ] Rate limiting
- [ ] Abuse throttling
- [ ] Admin RBAC hardening
- [ ] Secrets rotation
- [ ] Encryption at rest/in transit
- [ ] Secure file upload pipeline
- [ ] Prompt/tool injection guardrails

### 23.2 Privacy
- [ ] Data retention policy
- [ ] User data export
- [ ] Account deletion
- [ ] Message deletion policy
- [ ] Memory reset policy
- [ ] PII redaction in logs/traces

### 23.3 Legal/compliance
- [ ] Privacy policy requirements inputs
- [ ] Terms of service inputs
- [ ] Age restrictions decision
- [ ] Region compliance checklist as applicable

**Acceptance criteria**
- Core user rights and security controls are implemented, not deferred

---

## 24. Testing Strategy

### 24.1 Unit tests
- [ ] Policy engine
- [ ] Ranking functions
- [ ] Parser fallback logic
- [ ] DTO validators
- [ ] Websocket guards

### 24.2 Integration tests
- [ ] Auth flows
- [ ] Intent creation flow
- [ ] Matching flow
- [ ] Request acceptance flow
- [ ] 1:1 connection flow
- [ ] Group formation flow
- [ ] Moderation flow
- [ ] Admin actions

### 24.3 E2E tests
- [ ] Mobile/web critical path
- [ ] Agent thread -> async follow-up -> chat creation
- [ ] Reconnect and message sync
- [ ] Blocked-user behavior

### 24.4 Load and resilience tests
- [ ] Websocket concurrency test
- [ ] Queue backlog test
- [ ] Retry storm test
- [ ] Redis outage behavior
- [ ] OpenAI timeout fallback behavior

**Acceptance criteria**
- Critical product flows are covered by automated tests before prod rollout

---

## 25. Release Readiness

### 25.1 Feature flags
- [ ] Agent follow-up flags
- [ ] Group chat flags
- [ ] Personalization flags
- [ ] Discovery flags
- [ ] Moderation strictness flags

### 25.2 Staging verification
- [ ] Smoke test checklist
- [ ] Seeded demo data
- [ ] Manual QA script

### 25.3 Launch controls
- [ ] Internal alpha cohort
- [ ] Invite-only mode if needed
- [ ] Kill switches for:
  - new intents
  - group formation
  - push notifications
  - AI parsing
  - realtime chat

**Acceptance criteria**
- Core systems can be selectively disabled without full outage

---

## 26. Documentation Completion

### 26.1 Keep docs in sync
- [ ] Update architecture docs to match implementation decisions
- [ ] Update API docs from source
- [ ] Add queue contract doc from source
- [ ] Add ERD
- [ ] Add sequence diagrams for:
  - intent flow
  - group formation
  - agent async follow-up
  - moderation pipeline

### 26.2 Developer onboarding
- [ ] Local setup guide
- [ ] Debugging guide
- [ ] Common failure guide
- [ ] Queue replay guide
- [ ] Admin runbook
- [ ] Incident runbook

**Acceptance criteria**
- A new engineer or coding agent can start work without reverse engineering the system

---

## 27. Suggested Build Order

### Phase A — Foundation
- [ ] 0 Repo and governance
- [ ] 1 Infrastructure and environments
- [ ] 2 Shared domain types and contracts
- [ ] 3 Database foundation
- [ ] 4 Auth, identity, and sessions

### Phase B — Core user system
- [ ] 5 Profile and media system
- [ ] 6 Agent chat surface
- [ ] 7 OpenAI integration layer
- [ ] 8 Intent ingestion and understanding

### Phase C — Matching and async orchestration
- [ ] 9 Personalization, rules, and life graph
- [ ] 10 Embeddings and candidate retrieval
- [ ] 11 Matching and routing engine
- [ ] 12 BullMQ workflow orchestration
- [ ] 13 Notifications and agent follow-ups

### Phase D — Human connection product
- [ ] 14 Inbox and request handling
- [ ] 15 Human chat system
- [ ] 16 Realtime transport
- [ ] 17 Moderation and safety

### Phase E — Production control plane
- [ ] 18 Admin dashboard and debugging tools
- [ ] 19 Search, discovery, and suggestions
- [ ] 21 Analytics, experiments, and telemetry
- [ ] 22 Observability and ops
- [ ] 23 Security, privacy, and compliance
- [ ] 24 Testing strategy
- [ ] 25 Release readiness
- [ ] 26 Documentation completion

---

## 28. Immediate Next Tasks

### Sprint 0
- [x] Set up monorepo
- [x] Set up NestJS API
- [x] Set up Postgres + Redis + BullMQ locally
- [x] Set up auth skeleton
- [x] Create base DB schema
- [x] Create agent thread + intent models
- [x] Create OpenAI package with typed intent parser
- [x] Create initial BullMQ flow for intent processing
- [x] Create basic web/mobile shell
- [x] Create admin shell

### Sprint 1
- [x] Agent chat input to structured intent
- [~] Candidate retrieval MVP
- [x] Request fanout MVP
- [x] Inbox MVP
- [x] Accept/reject MVP
- [~] 1:1 chat MVP
- [~] Natural-language async agent follow-up MVP

### Sprint 2
- [ ] Group formation (max 4)
- [~] Personalization rules engine
- [~] Moderation MVP
- [~] Admin debugging MVP
- [~] Notifications MVP

---

## 29. Blockers / Decisions Needed

- [x] Confirm ORM choice
- [x] Confirm mobile stack
- [x] Confirm push provider
- [x] Confirm storage provider
- [x] Confirm admin framework
- [ ] Confirm exact OpenAI model policy by task
- [x] Confirm whether web user app ships in v1 or admin-only web first
- [x] Confirm whether profile verification is in v1 or later
- [ ] Confirm age/location policy
- [x] Confirm email support scope

---

## 30. Definition of MVP

MVP is complete when:

- [ ] User can sign in with Google
- [ ] User can create/edit profile and upload photo
- [ ] User can message their agent with a real social intent
- [ ] System parses and stores the intent
- [ ] System asynchronously finds and invites relevant users
- [ ] Recipients can accept/reject from inbox
- [ ] On acceptance, system opens a human chat
- [ ] User receives natural-language async follow-up from the agent
- [ ] 1:1 chat works reliably in real time
- [ ] Group chats up to 4 users work reliably
- [ ] Moderation and admin basics exist
- [ ] System is observable, testable, and deployable to staging

---

## 31. Definition of Production Readiness

Production readiness is complete when:

- [ ] all critical flows covered by tests
- [ ] all queues have retry/DLQ/repair flows
- [ ] auth and privacy controls implemented
- [ ] observability and alerting in place
- [ ] admin dashboard supports support/debug/moderation
- [ ] rollout and kill switches implemented
- [ ] backup/restore tested
- [ ] load and reconnect behavior validated
- [ ] OpenAI usage is versioned, logged, and cost-guarded
- [ ] docs and runbooks are current
