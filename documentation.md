# OpenSocial Documentation

## What this project is
OpenSocial is an intent-driven social routing platform. Users express what they want to do or discuss in natural language, the backend parses and matches candidates, and accepted requests become human-to-human chats.

## Local setup
Prerequisites:
- Node.js 22+
- pnpm 10+
- Docker

Install dependencies:
```bash
pnpm install
```

Start local infrastructure:
```bash
pnpm db:up
```

Generate Prisma client:
```bash
pnpm db:generate
```

Apply committed migrations:
```bash
pnpm db:migrate
```

Development migration workflow (create a new migration from schema changes):
```bash
pnpm db:migrate:dev
```

Run the monorepo:
```bash
pnpm dev
```

## One-command dev start
```bash
pnpm db:up && pnpm db:generate && pnpm dev
```

## Operational docs index
- `USE_CASES.md`
- `docs/local-setup-guide.md`
- `docs/frontend-critical-path.md` (Maestro + Playwright)
- `docs/debugging-guide.md`
- `docs/common-failures-guide.md`
- `docs/queue-contracts.md`
- `docs/queue-replay-runbook.md`
- `docs/admin-runbook.md`
- `docs/incident-runbook.md`
- `docs/erd.md`
- `docs/sequence-diagrams.md`
- `docs/staging-smoke-checklist.md`
- `docs/manual-qa-script.md`
- `docs/release-process.md`
- `docs/openai-model-policy.md`
- `docs/aws-free-tier-deploy.md`
- `docs/recurring-tasks-v1.md`

## Dependency currency
Use these commands from repo root:

```bash
pnpm deps:outdated
pnpm deps:outdated:latest
pnpm deps:update:latest
```

Rule:
- keep backend/security-critical libraries on latest stable unless blocked by a verified compatibility constraint.
- for frontend/tooling lanes, track major upgrades in `PROGRESS.md` with explicit blockers and migration owners.

## Central settings sync
Repo-level environment URLs and OAuth helper values are centralized in `settings.json`.

Sync generated app/env files:
```bash
pnpm settings:sync        # uses settings.json defaultEnvironment
pnpm settings:sync:dev
pnpm settings:sync:prod
```

Generated outputs:
- `apps/web/.env.local`
- `apps/admin/.env.local`
- `settings.generated/<env>.google-oauth.json`
- `settings.generated/<env>.server.env`

## Mobile app status
`apps/mobile` now includes a Tailwind/NativeWind-driven app foundation with:
- auth flow wired to `POST /api/auth/google/callback` with persisted session restore
- Google-only sign-in on mobile (manual/demo fallback removed) with in-app OAuth launch + deep-link callback relay through `GET /api/auth/google` -> `GET /api/auth/google/callback` -> app redirect, then token exchange via `POST /api/auth/google/callback`
- onboarding writes to profile + interests/topics + social mode + global rules APIs
- tabbed home shell (**Home** = agent chat, **Chats**, **Profile**) with animated transitions
- agent intent submission wired to `POST /api/intents`
- inbox requests API (`/api/inbox/requests/*`) remains available for matching flows; there is no dedicated inbox tab in the client shell
- passive discovery + agent recommendation publishing remain available server-side (`/api/discovery/:userId/*`, including `POST .../agent-recommendations`) for jobs and future surfaces—not exposed as a Discover tab in the current app
- chat sandbox flow (DM + group modes) wired to `/api/connections`, `/api/chats`, and chat message APIs
- hardened agent/chat composers with send-in-flight guards, empty-submit prevention, and keyboard-safe layout behavior for mobile interaction quality
- local chat persistence via AsyncStorage (per-user) including messages, unread counts, and sync watermarks
- reconnect-safe incremental chat sync wired to `/api/chats/:chatId/sync` + `/api/chats/:chatId/metadata`, with manual "Sync Now" control in the chats tab
- Socket.IO realtime layer for chats (`/realtime`) with room subscriptions, live `chat.message.created` fanout, replay ingestion (`chat.replay`), typing indicators (`chat.typing`), and explicit connection-state UI while polling fallback remains active
- idempotent chat send support by attaching optional `clientMessageId` to `POST /api/chats/:chatId/messages`
- in-app moderation actions for report/block from **chat** surfaces wired to `POST /api/moderation/reports` and `POST /api/moderation/blocks`
- local mobile telemetry event tracking (AsyncStorage-backed) for auth, onboarding, intent, inbox, chat, moderation, and personalization actions
- outbound request fanout telemetry (`request_sent`) via `POST /api/intents/summarize-pending` polling after intent creation
- in-app telemetry summary card under Profile tab with derived local metrics (intent→accept, intent→first-message, connection success/repeat rates, group formation completion, notification→open, moderation incident rate)
- discovery “recommendations to agent thread” API wired to `POST /api/discovery/:userId/agent-recommendations` (server/jobs; not a primary client button in the slim shell)
- profile settings saves wired to personalization and profile endpoints
- notification scaffolding with Expo permissions/token registration and local notification triggers
- shadcn-style reusable mobile UI primitives (`ui/button`, `ui/card`, `ui/chip`, `ui/alert`) powered by `class-variance-authority`, `clsx`, and `tailwind-merge`, with app-level components standardized on those variants
- mobile E2E local-mode support (`EXPO_PUBLIC_ENABLE_E2E_LOCAL_MODE=1`) for deterministic simulator automation even when backend services are unavailable
- mobile dependency baseline updated to latest stable Expo lane (`expo@55.0.8`) with refreshed runtime libs (`react@19.2.4`, `react-native-reanimated@4.2.3`, `react-native-safe-area-context@5.7.0`), deprecated `@types/react-native` removed, and `@react-native-async-storage/async-storage` pinned to `2.2.0` for Expo Go runtime compatibility
- security hardening patch applied at workspace level: root `pnpm.overrides` pins `markdown-it@12.3.2` to address CVE-2022-21670 (`react-native-markdown-display` transitive dependency); `pnpm audit --prod` currently reports zero production vulnerabilities
- known upgrade constraints tracked: `react-native@0.84.x` remains blocked by Expo managed compatibility for SDK 55, and `tailwindcss@4` remains blocked by NativeWind/`react-native-css-interop` peer constraint (`tailwindcss ~3`)

Run mobile app:
```bash
pnpm --filter @opensocial/mobile dev
```

Generate iOS native project (creates `apps/mobile/ios` on demand):
```bash
pnpm --filter @opensocial/mobile prebuild:ios
```

Run on iOS device:
```bash
pnpm --filter @opensocial/mobile run:ios:device
```
Use Xcode (`apps/mobile/ios/*.xcworkspace`) to set your Apple Team under Signing & Capabilities before first device deploy.

Mobile API target (defaults to `https://api.opensocial.so/api`; override for local API):
```bash
EXPO_PUBLIC_API_BASE_URL=http://localhost:3000/api pnpm --filter @opensocial/mobile dev
# or: EXPO_PUBLIC_USE_LOCAL_API=1 pnpm --filter @opensocial/mobile dev
```
See `docs/mobile-google-signin.md` for the OAuth redirect chain (Google → API → app deep link).

Build mobile JS bundles (CI smoke build):
```bash
pnpm --filter @opensocial/mobile build
```

Run mobile Maestro E2E critical path (after starting app with `EXPO_PUBLIC_ENABLE_E2E_AUTH_BYPASS=1` and `EXPO_PUBLIC_ENABLE_E2E_LOCAL_MODE=1`):
```bash
pnpm --filter @opensocial/mobile test:e2e:maestro
```

Mobile Google OAuth notes:
- Backend must expose a reachable callback URL in `GOOGLE_REDIRECT_URI` (for example `https://api.example.com/api/auth/google/callback` in deployed environments).
- The same callback URL must be registered in the Google OAuth client configuration.
- Mobile app receives the Google auth code via deep link and then exchanges it with backend auth APIs.

## Web app status
`apps/web` runs **Next.js 16** with **Turbopack** as the default bundler for dev and production build (webpack only via explicit `--webpack`). **Tailwind CSS v4** uses `@tailwindcss/postcss` and `@import "tailwindcss"` in `globals.css`. The app is the user client with explicit reduced-surface parity for core flows:
- auth callback sign-in + persisted session restore
- onboarding profile/rule setup
- tabbed shell (**Home** = agent chat, **Chats**, **Profile**)
- agent intent submission
- chat sandbox creation and message send/list
- profile notification/social-mode controls
- inbox APIs are used by the backend for matching; the web shell does not include a separate inbox tab
- **Design mock** (`NEXT_PUBLIC_DESIGN_MOCK=1`): static preview with Playwright coverage (`pnpm --filter @opensocial/web test:e2e`, installs Chromium via `pnpm --filter @opensocial/web test:e2e:install`)

Run web app:
```bash
pnpm --filter @opensocial/web dev
```

Optional web env override:
```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000/api pnpm --filter @opensocial/web dev
```

## Admin app status
`apps/admin` is **Next.js 16** (default **Turbopack**; no webpack unless `--webpack`) + **Tailwind CSS v4** with a responsive admin console (**shadcn-style Radix/CVA primitives**, sidebar shell, cards/alerts) for debugging and operations workflows:
- **Google sign-in** via the same OAuth flow as clients: start from the admin app, Google redirects to `GET /api/auth/google/callback`, then the API redirects back to `{admin origin}/auth/callback?code=…` and the dashboard exchanges the code with **`adminConsole: true`**, which enforces **`ADMIN_CONSOLE_ALLOWED_EMAILS`** (comma-separated; defaults to `jeffersonlicet@gmail.com` when unset). Local dev allows `http://localhost:3001/auth/callback` and `http://127.0.0.1:3001/auth/callback` without extra config; production must set **`ADMIN_DASHBOARD_REDIRECT_URIS`** to the full callback URL(s). The signed-in user id is used as **`x-admin-user-id`**; allowlist **`ADMIN_ALLOWED_USER_IDS`** / **`ADMIN_ROLE_BINDINGS`** on the API still apply.
- **`ADMIN_API_KEY`**: leave empty for the hosted admin app (it does not send **`x-admin-api-key`**). Set only if you call `/api/admin` from tools that inject the header.
- **`Authorization: Bearer`** from the Google session for user-scoped routes; agent **SSE** uses query **`access_token`** on `GET /api/agent/threads/:threadId/stream` only (browser `EventSource` cannot set headers)
- tabbed operations workbench: overview, users, intents, chats, moderation, personalization, and agent traces
- admin context controls for RBAC headers (`x-admin-user-id`, `x-admin-role`)
- admin health polling
- dead-letter list + replay trigger
- outbox relay trigger
- internal query helper: execute arbitrary API calls (method/path/query/body) with in-app response + history
- user/profile/trust/global-rules/interests/topics/availability/photos/sessions/inbox inspection by user ID
- account/session superpowers: revoke one session, revoke all sessions, deactivate account, restrict/shadow-ban account
- intent controls: explanation inspection, force-cancel, retry, widen filters, convert to group/1:1, summarize pending
- chat controls: inspect messages + metadata, reconnect sync snapshot, leave participant action, moderation hide-message action, stuck-flow repair routine
- moderation controls: create report/block entries plus moderation queue + audit log inspection
- personalization controls: inspect life graph + policy decision explanation
- agent controls: inspect thread messages, inject a debug user message, and live SSE trace streaming
- digest trigger for selected user ID

Run admin app:
```bash
pnpm --filter @opensocial/admin dev
```

## Quality commands
Run formatting check:
```bash
pnpm format:check
```

Run lint:
```bash
pnpm lint
```

Run typecheck:
```bash
pnpm typecheck
```

Run tests:
```bash
pnpm test
```

Web design-mock E2E (Playwright; starts Next with `NEXT_PUBLIC_DESIGN_MOCK=1`):
```bash
pnpm --filter @opensocial/web test:e2e:install   # once per machine/CI image
pnpm --filter @opensocial/web test:e2e
```

Run schema validation/drift baseline check:
```bash
pnpm db:drift-check
```

## Observability baseline
- HTTP requests now carry a correlation id:
  - incoming `x-trace-id` is accepted when provided
  - otherwise a UUID trace id is generated server-side
  - response always includes `x-trace-id`
- API envelope helper (`ok(...)`) now auto-attaches request trace id when available.
- API emits structured JSON request-completion logs (`event: http.request.completed`) including trace id, method, path, status, duration, and sanitized request metadata.
- Queue processors emit structured job-processing logs (`event: queue.job.processing`) including queue name, job id/name, attempts, extracted trace id, and redacted payload snapshot.
- Shared log redaction helper masks sensitive keys such as authorization/cookie/token/secret/password/api-key/session/code before writing structured logs.

## Deployment pipelines
- Staging deploy workflow: `.github/workflows/deploy-staging.yml`
- Production deploy workflow: `.github/workflows/deploy-production.yml`
- Production rollback workflow: `.github/workflows/rollback-production.yml`
- Supporting scripts: `scripts/deploy-staging.sh`, `scripts/deploy-production.sh`, `scripts/deploy-rollback.sh`

## Auth/session endpoints
- `GET /api/auth/google`
- `POST /api/auth/google/callback`
- `POST /api/auth/refresh`
- `GET /api/auth/sessions/:userId`
- `POST /api/auth/sessions/:sessionId/revoke`
- `POST /api/auth/sessions/revoke-all`

Auth hardening currently implemented:
- Session revocation (single session + bulk revoke-all).
- Refresh-token mismatch revokes the active session.
- Suspicious refresh/login hooks emitted via `outbox_events`.
- Auth event audit trail persisted in `audit_logs`.
- CSRF token flow is intentionally not enabled in current API mode because auth is bearer-token JSON based (not cookie-session based).

Google OAuth behavior:
- `POST /api/auth/google/callback` now exchanges the authorization code against Google token endpoint and resolves identity from OpenID userinfo (`sub`, `email`, `name`).
- If Google OAuth credentials are not configured (local/dev), callback uses deterministic fallback identity derived from the code so auth flows remain testable offline.

## Profile/personality endpoints
- `GET /api/profiles/:userId`
- `PUT /api/profiles/:userId`
- `GET /api/profiles/:userId/completion`
- `GET /api/profiles/:userId/trust`
- `GET|PUT /api/profiles/:userId/interests`
- `GET|PUT /api/profiles/:userId/topics`
- `GET|PUT /api/profiles/:userId/availability-windows`
- `PUT /api/profiles/:userId/social-mode`
- `GET|PUT /api/profiles/:userId/intent-preferences`
- `GET|PUT /api/personalization/:userId/rules/global`
- `GET /api/personalization/:userId/life-graph`
- `POST /api/personalization/:userId/life-graph/nodes`
- `POST /api/personalization/:userId/life-graph/edges/explicit`
- `POST /api/personalization/:userId/life-graph/signals`
- `POST /api/personalization/:userId/retrieval/profile-summary/refresh`
- `POST /api/personalization/:userId/retrieval/preference-memory/refresh`
- `POST /api/personalization/:userId/retrieval/interactions`
- `POST /api/personalization/:userId/retrieval/query`
- `POST /api/personalization/:userId/policy/explain`
- `POST /api/profiles/:userId/photos/upload-intent`
- `POST /api/profiles/:userId/photos/:imageId/complete`
- `GET /api/profiles/:userId/photos`
- `GET /api/profiles/:userId/photo` (approved photo or generated fallback avatar)

Profile photo pipeline behavior:
- Direct upload intent endpoint returns signed upload URL + storage key.
- Upload completion enqueues `ProfilePhotoUploaded` on `media-processing`.
- Worker applies deterministic moderation heuristics and marks image `approved`, `pending_review`, or `rejected`.
- Approved photos receive thumbnail and CDN delivery URLs, and previous active photos are marked `replaced`.
- Non-approved outcomes emit in-app `moderation_notice` notifications to the owner.

Global rules behavior:
- Users can store explicit global rules for contact eligibility, reachability, intent mode (1:1/group), modality, language, verification requirements, notification mode, agent autonomy, and memory preference.
- Matching applies hard rules before ranking for both candidate and sender safety preferences, including contact eligibility, reachability, intent-mode compatibility, modality compatibility, and sender verified-only requirements.
- Notification delivery channel selection respects explicit global notification mode rules.
- Policy explainability endpoint returns ordered precedence checks and first blocking rule for admin/debug investigations.

Life graph behavior:
- Supported node types: `activity`, `topic`, `game`, `person`, `schedule_preference`, `location_cluster`.
- Supported edge types: `likes`, `avoids`, `prefers`, `recently_engaged_with`, `high_success_with`.
- Explicit and inferred preferences are stored separately (`explicit_preferences` vs `inferred_preferences`) and merged into materialized `life_graph_edges` weights.
- Behavior-driven updates are captured from intent ingestion, request acceptance/rejection, and successful connection setup.

Retrieval/personalization memory behavior:
- Profile summary and preference memory documents are persisted in `retrieval_documents` and chunked into `retrieval_chunks`.
- Interaction summaries can be stored per user; unsafe summaries are tagged as `interaction_summary_flagged`.
- Retrieval query path returns only safe doc types and applies staleness filtering (`maxAgeDays`) before chunk scoring.
- Chunk ranking blends lexical overlap with freshness for personalization-aware context retrieval.

Matching retrieval behavior:
- Candidate retrieval now uses semantic similarity between intent embeddings (`intent_text`) and user profile embeddings (`profile_summary`) in `embeddings` (`pgvector`).
- Hard constraints are applied before semantic retrieval and rechecked after semantic results are returned (block/suppression, reachability, contact eligibility, intent-mode compatibility, modality compatibility, sender verified-only mode, away/invisible exclusions).
- If semantic vectors are unavailable for part of the pool, lexical interest/topic overlap is used as fallback retrieval so relevant users are still considered.
- Retrieval snapshots are written to `audit_logs` with action `matching.candidates_retrieved`, including trace metadata and top-candidate rationale/score breakdown.
- Offline intent safeguards enforce non-private visibility, same-country pairing, and minimum account-age checks for both sender and candidate (configurable via `OFFLINE_SAFETY_MIN_ACCOUNT_AGE_DAYS`, default `7`).
- Reranking blends these feature scores for final ordering:
  - availability fit (presence mode + availability-window overlap + timing signal)
  - trust/reputation (trust score with moderation/report penalties)
  - recent-interaction suppression (novelty fatigue)
  - offline proximity score (same city/country boosts)
  - style/vibe compatibility from intent skill/vibe constraints
  - personalization boosts from life graph preferences (`likes`, `avoids`, `high_success_with`)

## Agent thread endpoints
- `GET /api/agent/threads/me/summary` (primary thread for the authenticated user; `data` may be `null`)
- `GET /api/agent/threads/:threadId/messages`
- `POST /api/agent/threads/:threadId/messages`
- `POST /api/agent/threads/:threadId/respond` (full agentic turn; optional `voiceTranscript`, `attachments[]` with `image_url` or `file_ref`, optional `traceId` string ≤256 chars, optional `streamResponseTokens`)
- `POST /api/agent/threads/:threadId/respond/stream` (same body shape; server runs the turn with response-token workflow streaming enabled)
- `GET /api/agent/threads/:threadId/stream` (SSE stream of new thread messages as `event: agent.message` with JSON payload: `id`, `threadId`, `role`, `content`, `createdByUserId`, `createdAt`, optional `metadata`)

**Client streaming pattern (web / mobile):** Subscribe to `GET .../stream?access_token=<jwt>` (query token is accepted **only** on this path so browsers can use `EventSource`). Send `POST .../respond/stream` with a client-chosen `traceId` and `Authorization: Bearer`. Workflow rows with `metadata.stage === "response_token"` and matching `metadata.traceId` carry partial assistant text (`model_stream` or `chunked_fallback` in `metadata.details.source`). After the POST completes, reload `GET .../messages` for the canonical transcript. Shared helper: `extractResponseTokenDelta` in `@opensocial/types` (`agent-transcript.ts`).

## Intent orchestration endpoints
- `POST /api/intents`
- `PATCH /api/intents/:intentId`
- `GET /api/intents/:intentId/explanations`
- `GET /api/intents/:intentId/explanations/user`
- `POST /api/intents/from-agent`
- `POST /api/intents/:intentId/cancel`
- `POST /api/intents/:intentId/retry`
- `POST /api/intents/:intentId/widen`
- `POST /api/intents/:intentId/convert`
- `POST /api/intents/summarize-pending`

Intent fanout cap behavior:
- Fanout is dynamically capped per pipeline run (base 1:1 cap, group-intent cap adjusted by `groupSizeTarget`, and sender-level pending/24h outreach quotas).
- If candidates are available but sender cap is exhausted, no new requests are sent in that run; intent remains in `matching`, and the user receives a progress update plus delayed follow-up for retry.
- Every pipeline pass persists a routing-attempt history record in `audit_logs` (`action: routing.attempt`) including attempt index, candidate/fanout counts, cap/quota snapshot, selected IDs, and outcome.
- Delayed routing retries are enqueued automatically (`IntentCreated` with delayed job IDs) for fanout follow-up, cap-reached, and no-candidate outcomes.
- Timeout escalation is automatic on no-candidate paths: at 8+ minutes the system widens strict constraints (urgency/timing/skill/vibe and modality), and at 16+ minutes it also broadens topics/activities; each escalation writes `routing.filters_widened` audit logs and schedules an expedited retry (`intent-created:<intentId>:timeout_escalated`).
- Candidate selection rationale is persisted per `intent_candidate` with explicit selection metadata (`finalScore`, top `selectedBecause` feature keys, `selectionRecordedAt`, routing escalation level).
- `GET /api/intents/:intentId/explanations` returns ranked candidate explanations with safe fields for debug/admin surfaces (retrieval source, overlap/similarity scores, trust band + normalized trust, availability/proximity/style/personalization signals) while omitting raw sensitive trust score values.
- `GET /api/intents/:intentId/explanations/user` returns concise user-facing explanation text generated from top selection factors (for example shared topics, availability fit, style compatibility).
- Intent creation now runs deterministic moderation gating before fanout: harmful intents are marked `safety_state=blocked` and cancelled; uncertain intents are marked `safety_state=review` and held for manual review path.
- Moderated intents persist `moderation_flags` + `audit_logs` records (`intent.moderation_decision`) and emit `moderation_notice` notifications.
- Queue reliability now includes explicit idempotency keys on active job payloads (`IntentCreated`, `RequestAccepted`, `ProfilePhotoUploaded`, `AsyncAgentFollowup`) with deterministic `jobId` alignment, so duplicate enqueue attempts collapse safely at the queue layer.
- Active queue producers apply bounded retries with exponential backoff (current baseline: `attempts: 3`, `delay: 1000`, exponential), including manual intent-retry scheduling.
- Worker failures are dead-lettered into `audit_logs` (`action: queue.job_dead_lettered`) only after retries are exhausted, with queue/job/payload/attempt metadata for triage.
- Stalled worker events are recorded into `audit_logs` (`action: queue.job_stalled`) with queue/job context; recovery path is BullMQ auto requeue.

## Discovery endpoints
- `GET /api/discovery/:userId/tonight` (ranked suggestions for what to do tonight)
- `GET /api/discovery/:userId/passive` (full passive discovery bundle: tonight + active intents/users + groups + reconnects)
- `GET /api/discovery/:userId/inbox-suggestions` (suggestion cards intended for inbox surface)
- `POST /api/discovery/:userId/agent-recommendations` (writes lightweight discovery summary into latest/specified agent thread)

Discovery behavior notes:
- Ranking model `discovery-v1` blends semantic fit, life-graph affinity, policy/trust safety, and recency.
- Passive discovery includes:
  - tonight user suggestions
  - active intents or user fallbacks
  - suggested groups assembled from overlapping candidate topics
  - suggested reconnects from prior connection history (block-aware)
- Agent recommendation publishing appends a `workflow` message with discovery highlights and structured metadata (`category: discovery_recommendations`).
- Inbox suggestions prioritize pending-request awareness, then add reconnect and tonight recommendations.

## Analytics endpoints
- `POST /api/analytics/events` (record analytics event envelope into `audit_logs`)
- `GET /api/analytics/events` (list analytics events with optional filters: `eventType`, `actorUserId`, `limit`)
- `GET /api/analytics/metrics/core` (compute KPI snapshot; optional `days` window)
- `GET /api/analytics/experiments/guardrails` (read rollout health checks + threshold status)
- `GET /api/analytics/experiments/users/:userId/assignments` (deterministic experiment assignment with persisted preference state)

Analytics behavior notes:
- Analytics events are persisted as `audit_logs` rows with `action: analytics.event` and typed metadata (`eventType`, `occurredAt`, `properties`).
- Backend instrumentation currently emits:
  - auth lifecycle: `oauth_connected`, `signup_completed`
  - onboarding completion: `profile_completed`
  - intent lifecycle: `intent_created`, `request_sent`
  - inbox outcomes: `request_accepted`, `request_rejected`
  - connection/chat outcomes: `connection_created`, `chat_started`, `first_message_sent`, `message_replied`
  - personalization updates: `personalization_change`
  - safety outcomes: `report_submitted`, `user_blocked`
  - notification conversion: `notification_opened`
- Core KPI endpoint returns rolling-window values for:
  - intent-to-first-acceptance
  - intent-to-first-message
  - connection success rate
  - group formation completion rate
  - notification-to-open rate
  - repeat connection rate
  - moderation incident rate

## Notification endpoints
- `POST /api/notifications/:userId/digest` (creates an in-app digest summary now)
- `POST /api/notifications/:notificationId/read` (marks a notification as read for a provided `userId` and emits `notification_opened`)

## Admin operations endpoints
- `GET /api/admin/health`
- `GET /api/admin/users` (latest users with profile/trust/moderation summary)
- `GET /api/admin/intents` (latest intent lifecycle state snapshot)
- `GET /api/admin/requests` (latest inbox/fanout request states)
- `GET /api/admin/connections` (latest connections with participants + chat linkage)
- `GET /api/admin/chats` (latest chats with message counts + connection summary)
- `GET /api/admin/reports` (latest user report queue)
- `GET /api/admin/jobs/dead-letters` (list dead-lettered queue jobs)
- `POST /api/admin/jobs/dead-letters/:deadLetterId/replay` (requeue dead-letter job with replay idempotency key)
- `GET /api/admin/jobs/queues` (queue monitor snapshot with per-queue counts + paused state; bull-board equivalent)
- `POST /api/admin/outbox/relay` (publish pending `outbox_events` and mark `published_at`)
- `GET /api/admin/moderation/queue` (open moderation flags queue)
- `GET /api/admin/moderation/agent-risk-flags` (filtered list of `agent_thread` flags from conversational risk checks; query: `limit`, optional `status`, optional `decision` `review`|`blocked`; joins latest `moderation.agent_risk_assessed` audit + latest assignment audit per flag)
- `POST /api/admin/moderation/flags/:flagId/assign` (record reviewer assignment; body: `assigneeUserId`, optional `reason`)
- `POST /api/admin/moderation/flags/:flagId/triage` (body: `action` `resolve` | `reopen` | `escalate_strike` | `restrict_user`, optional `reason`, optional `targetUserId` for strike/restrict, optional `strikeSeverity` / `strikeReason`)
- `GET /api/admin/audit-logs` (latest audit log stream)
- `POST /api/admin/users/:userId/deactivate` (suspend account + revoke active sessions)
- `POST /api/admin/users/:userId/restrict` (set profile moderation state to blocked)
- `POST /api/admin/intents/:intentId/replay` (requeue intent workflow)
- `GET /api/admin/intents/:intentId/routing-explanations` (inspect ranked routing rationale)
- `GET /api/admin/users/:userId/personalization/rules` (inspect global personalization rules)
- `POST /api/admin/users/:userId/notifications/resend` (resend explicit in-app notification)
- `POST /api/admin/chats/:chatId/repair` (repair marker + optional sync preview + outbox relay trigger)

Admin RBAC + audit notes:
- Admin endpoints now require `x-admin-user-id` (UUID) and `x-admin-role` (`admin`, `support`, `moderator`).
- Role policy:
  - `support`/`admin`: dead-letter + replay + outbox relay + audit log listing + intent replay + personalization/routing inspection + notification resend + user deactivate.
  - `moderator`/`support`/`admin`: users/intents/requests/connections/chats/reports listing + moderation queue listing + queue monitor snapshot + user restrict + chat repair + routing explanation inspection.
  - `moderator` is intentionally denied replay/outbox operations.
- Every admin endpoint invocation writes `admin_actions` rows and mirrored `audit_logs` entries (`action: admin.action`) with role and context metadata.

## Inbox request endpoints
- `GET /api/inbox/requests/:userId` (lists pending requests, excluding currently snoozed ones)
- `POST /api/inbox/requests/:requestId/accept`
- `POST /api/inbox/requests/:requestId/reject`
- `POST /api/inbox/requests/:requestId/cancel`
- `POST /api/inbox/requests/expire-stale`
- `POST /api/inbox/requests/bulk` (`action: decline | snooze`)

`expire-stale` endpoint protection:
- In `production`, stale-expiry execution is blocked unless `INBOX_EXPIRE_STALE_CRON_KEY` is configured and provided via `x-cron-key`.
- In non-production environments, the route remains callable without a cron key for local/dev ergonomics.

Bulk request behavior:
- `decline`: batch rejects pending requests for recipient scope, records rejection behavior signals, and notifies senders.
- `snooze`: writes `request_responses` with `action: snooze:<minutes>`; snoozed pending requests are hidden from inbox listing until the snooze window expires.
- Inbox list responses now include request-card metadata:
  - `cardSummary.who` (sender display label)
  - `cardSummary.what` (intent/request text)
  - `cardSummary.when` (relative timing/expiry hint)
  - `internal.whyMe` (non-user-facing rationale factors for future card explainability)

## Chat endpoints
- `POST /api/chats`
- `GET /api/chats/:chatId/messages`
- `GET /api/chats/:chatId/metadata`
- `GET /api/chats/:chatId/sync` (`userId`, optional `after`, `limit`)
- `POST /api/chats/:chatId/messages`
- `POST /api/chats/:chatId/messages/:messageId/read`
- `POST /api/chats/:chatId/messages/:messageId/soft-delete`
- `POST /api/chats/:chatId/messages/:messageId/hide`
- `POST /api/chats/:chatId/leave`

Chat behavior notes:
- Soft-delete masks sender-owned message bodies as `[deleted]` (non-destructive update).
- Message send now enforces block-aware restrictions: if sender is blocked by or has blocked any active participant in the underlying connection, send is rejected.
- Message send now applies pre-send moderation policy: blocked terms reject delivery, while review-grade terms are auto-hidden (`[hidden by moderation]`) and escalated to moderation flags/audit records.
- Chat message create accepts optional `clientMessageId` for idempotent duplicate suppression.
- Message list/sync responses include derived status summary (`sent`/`delivered`/`read`, delivered/read/pending counts).
- Group chat lifecycle emits persisted system notices for join/leave/archive and moderation hide actions.
- Group/DM leave handling marks `connection_participants.left_at`; connections auto-archive when active-participant threshold is no longer met.
- Reconnect sync endpoint returns ordered, deduplicated message windows plus unread count and `highWatermark`.

Realtime behavior notes:
- Gateway supports explicit reconnect auth via `connection.authenticate` (`userId`, optional `rooms`, optional `replaySince`).
- Reconnect path emits `connection.recovered` and best-effort `chat.replay` events per joined room, replaying persisted DB messages within replay window.
- `chat.send` now returns server-assigned IDs/sequence and enforces duplicate suppression by `roomId + senderUserId + clientMessageId`.
- Server realtime message payloads (`chat.message`) include `serverMessageId`, monotonic room `sequence`, and `sentAt`.
- Insecure socket identity fallback (`REALTIME_ALLOW_INSECURE_USER_ID`) is automatically disabled in `production`, even if the env flag is set.
- API bootstrap now wires a custom Socket.IO adapter that enables connection-state recovery and optional Redis fanout adapter for multi-node propagation.
- Redis adapter activation is controlled by `SOCKET_IO_REDIS_ADAPTER_ENABLED=true` (uses `REDIS_URL` or defaults to `redis://127.0.0.1:6379`).
- Sticky-session-friendly cookie config is enabled by default for deployment affinity (`SOCKET_IO_STICKY_SESSIONS_ENABLED`, cookie name override `SOCKET_IO_STICKY_COOKIE_NAME`).

## Moderation endpoints
- `POST /api/moderation/reports` (supports optional `entityType` + `entityId` for intent/chat/profile/user scoped escalation)
- `POST /api/moderation/assess` (client-callable content risk snapshot; optional `userId` must match actor when set)
- `POST /api/moderation/blocks`
- `POST /api/moderation/strikes`
- `GET /api/moderation/users/:userId/enforcement`

Moderation behavior notes:
- Intent creation applies deterministic text moderation before fanout and sets `safety_state` to `blocked` or `review` when policy triggers.
- Reviewed/blocked intents create `moderation_flags`, audit records, and `moderation_notice` notifications.
- Post-send user reports with entity scope create/open moderation queue flags (`reason: report:<reason>`) and write `moderation.report_submitted` audit events.
- Reports can automatically issue strikes to target users for high-risk categories (for example chat abuse/harassment/impersonation) and persist strike state in `user_preferences` (`key: moderation.strikes.v1`).
- Strike enforcement tiers: `warn` (1), `flag` (2), `restrict` (3-4), `suspend` (5+), with corresponding `user_profiles.moderation_state` and `users.status` escalation.
- Profile text moderation now applies to profile fields/interests/topics with blocked-or-review outcomes, moderation flags, and moderation notices.
- Impersonation reports escalate target profiles into review state for manual moderation handling.

Async follow-up behavior:
- Intent fanout/no-match paths enqueue delayed `AsyncAgentFollowup` jobs on the `notification` queue.
- Follow-up worker writes natural-language updates into the latest agent thread (when available).
- Same follow-up content is also sent as in-app notifications (`reminder` for pending reminders, `agent_update` for progress/no-match).
- Delivery channel routing supports:
  - `push` when user has active device-backed session reachability and notification mode urgency/immediacy requires it
  - `in_app` fallback when push reachability is unavailable
  - `digest` during quiet/digest preference windows
- Digest-channel notifications enqueue `NotificationDispatch` jobs and emit `notification.email_digest_dispatched` audit records when the digest delivery handoff is processed.
- Template coverage includes:
  - pending reminder ("Remember you asked earlier…")
  - no-match prompt ("Nobody matched yet; want me to widen filters?")
  - progress update ("X accepted, Y pending")

Persisted agent-thread message roles:
- `user`: user-authored request messages.
- `agent`: natural-language assistant responses/follow-ups.
- `system`: platform/system status notices.
- `workflow`: async pipeline progress updates (matching/fanout/etc.).

## OpenAI integration layer
- Task-routed model selection in `@opensocial/openai` (intent parsing, suggestions, ranking explanation, moderation/notification placeholders).
- Exact model-by-task resolution order and env keys are documented in `docs/openai-model-policy.md`.
- Trace metadata standard includes `traceId` + `correlationId` for every OpenAI request.
- Prompt registry includes versioned instructions per task (for example `intent_parsing.v1`, `suggestion_generation.v1`) and attaches `promptVersion` into OpenAI request metadata.
- Golden fallback parsing dataset is maintained in `@opensocial/openai` and used by API tests for regression validation.
- Failure capture/replay is built into the OpenAI client with bounded in-memory records and replay helpers for captured task failures.
- Typed structured outputs implemented for:
  - parsed intent
  - suggestion list
  - ranking explanation
- Parsed intent extraction includes:
  - `intentType`, `urgency`, `modality`
  - `topics`, `activities`, `groupSizeTarget`
  - `timingConstraints`, `skillConstraints`, `vibeConstraints`
- Embedding generation currently persists vectors into `embeddings` for:
  - user profile summaries
  - user interests/topics
  - intents
  - interaction/conversation summaries
- Embeddings use OpenAI `text-embedding-3-small` when API key is configured, with deterministic fallback vectors for offline/dev reliability.
- Deterministic fallback outputs are used when OpenAI API key is absent or model output fails schema parse.
- Agent policy definitions are centralized in `@opensocial/openai` with:
  - manager + specialist roles
  - explicit handoff/tool allowlists
  - human-approval checks for risky actions
  - background-run policy helpers

## Group formation notifications
- Group setup emits `group_formed` in-app notifications to all participants when readiness threshold is met.
- Readiness threshold uses:
  - full target (`groupSizeTarget`) immediately
  - fallback quorum (`max(2, targetSize - 1)`) after 10 minutes since intent creation
- Sender receives agent-thread updates distinguishing partial progress vs fully ready vs fallback-threshold readiness.
- While group is still below readiness threshold, system can auto-backfill: it selects next best uncontacted `intent_candidates`, creates a new request wave, notifies new recipients, and posts sender-thread updates about added backfill invites.
- Backfill respects capacity ceilings: if current participants plus pending invites already meet projected capacity (`min(4, targetSize)`), no extra invites are sent.
- Active 1:1 intents auto-convert to group flow when multiple recipients accept; existing intent-bound DM connections are promoted to `group` and then managed by the same threshold/backfill/capacity rules.

## Export CLI
Status: not implemented yet.

Planned usage example:
```bash
pnpm export --user-id <uuid> --format json
```

## Multiplayer local demo (two tabs, session link)
Status: available via `apps/web` reduced-surface client.

Demo path:
1. Open `http://localhost:3002` in two browser tabs.
2. Sign in each tab with different demo auth codes (`demo-web-a`, `demo-web-b`).
3. Use **Home** to submit intents; handle opt-in requests via API/admin flows as needed (no inbox tab in the slim client).
4. Use **Chats** to create a chat sandbox and exchange messages.

## Replay mode demo
Status: replay mode is not implemented yet.

## Repository structure
- `apps/api`: NestJS API, queues, realtime gateway, core domain services.
- `apps/admin`: Next.js admin shell.
- `apps/mobile`: Expo mobile app (auth, onboarding, home tabs, Tailwind/NativeWind UI, local chat persistence/sync).
- `apps/web`: Next.js responsive user client (reduced-surface core flow parity).
- `packages/types`: shared enums, schemas, and queue payload contracts.
- `packages/openai`: OpenAI client wrapper and intent parsing schema.
- `packages/config`: shared app config helpers.
- `packages/ui`: shared UI tokens/primitives.
- `packages/testing`: shared testing constants/helpers.
- `prisma`: schema and seed script.
- `docs`: governance, release, staging smoke, and data retention/archive strategy docs.

## Troubleshooting
1. `DATABASE_URL`/`REDIS_URL` errors:
Set values from `.env.example` and ensure Docker services are running.

2. Prisma client issues after schema updates:
Run `pnpm db:generate`.

3. Redis/BullMQ connection failures:
Ensure `pnpm db:up` succeeded and Redis is reachable at `localhost:6379`.

4. Lint/type errors after dependency changes:
Run `pnpm install` at repo root and rerun `pnpm lint && pnpm typecheck`.
