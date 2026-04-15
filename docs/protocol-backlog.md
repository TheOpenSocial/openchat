# Protocol Backlog

This document is the canonical backlog for protocolization and third-party integration.

The goal is not to turn OpenSocial into a generic social SDK. The goal is to extract a stable protocol layer from the product we already have so first-party apps, third-party apps, and agents can interoperate around the real OpenSocial domain: identity, profiles, intents, requests, connections, chats, circles, notifications, and realtime events.

## Goals

- Define a stable protocol surface that external apps can integrate with without depending on private backend internals.
- Make OpenSocial extensible through capabilities, scoped auth, and event subscriptions rather than through direct database or module access.
- Preserve the current product direction by omitting generic social primitives that do not match the product, especially posts and follows.
- Extract shared contracts into packages so the frontend, backend, and third-party SDKs all consume the same types and event vocabulary.
- Keep the protocol narrow at the core and extensible at the edges.

## Non-Goals

- Do not build a generic “social network SDK” centered on posts, feeds, likes, or follows.
- Do not expose raw database models as the integration surface.
- Do not let third parties call arbitrary backend internals.
- Do not rewrite the application around an SDK abstraction before the protocol contract is stable.
- Do not add blockchain, token economics, or crypto-specific dependencies.

## Protocol Shape

The protocol should be built around the product’s actual primitives:

- Identity and profiles
- Intents and intent updates
- Requests and responses
- Connections
- Chats and messages
- Circles and groups
- Notifications
- Agent threads
- Realtime events

The protocol should expose three kinds of integration:

1. Read state
2. Write actions
3. Subscribe to events

## Current Shipped State

The protocol is no longer just a concept. The following pieces are already present in the backend and should be treated as the stable base for the next phase:

- Protocol app registration is persisted on top of the `protocol_apps` rows.
- App tokens are issued, hashed, verified, rotated, and revoked at the protocol layer.
- Webhook subscriptions are persisted, signed, and recorded as deliveries.
- The event log and replay cursor state are persisted.
- The protocol manifest, discovery document, and event catalog are exposed from the protocol service.
- Scoped grants are persisted and exposed through `protocol_app_scope_grants` with `subjectType=user|app|service|agent`.
- A separate consent-request resource now exists with list/create/approve/reject flows, so approval lifecycle stays separate from active enforcement grants.
- The first external action surface is now live for:
  - `intent.create`
  - `request.send`
  - `request.accept`
  - `request.reject`
  - `chat.send_message`
  - `circle.create`
  - `circle.join`
  - `circle.leave`
- These actions are enforced through:
  - app token scope/capability checks
  - delegated user grants on `actions.invoke`
- The webhook delivery runner is now executable through the protocol API for an app-scoped direct run.
- A queue-backed delivery path now exists through the `protocol-webhooks` worker lane.
- A cron-safe global dispatch endpoint now exists for scheduled protocol webhook execution across apps.
- Webhook delivery attempts are now persisted per delivery with outcome, duration, status code, and error metadata.
- Queue inspection now exposes both persisted delivery records and live queue state counts.
- Dead-lettered deliveries can now be replayed explicitly through the protocol API and first-party settings surfaces.
- Dead-lettered deliveries can now be replayed in batch for an app, and usage summaries expose queue-health timestamps for queued, retrying, and dead-lettered work.
- Usage visibility is now exposed through a protocol app usage summary so first-party settings surfaces can inspect recent protocol activity without raw table access.
- Usage summaries now include token and grant audit timestamps for first-party inspection surfaces.
- Usage summaries now also include structured auth-failure counts and recent auth-failure entries so developers can diagnose missing-token, invalid-token, revoked-app, and grant-scope issues without raw event-log queries.
- First-party mobile and web settings surfaces now support token rotate/revoke and grant creation/revocation flows for protocol apps.
- First-party mobile and web settings surfaces now frame grants as delegated access and expose dead-letter replay controls.
- First-party runtime and agent intent/request flows now have protocol-service call-through paths for the cleanest social actions.
- The direct `POST /intents` controller path now routes through the same first-party protocol intent action before hydrating the created intent response, so first-party HTTP intent creation shares protocol event semantics with runtime intent creation.
- The direct `PATCH /intents/:intentId` and `POST /intents/:intentId/cancel` controller paths now route through first-party protocol intent lifecycle actions, so first-party HTTP intent edits and cancellations share protocol event semantics with the protocol/runtime path.
- The direct `POST /intents/:intentId/retry` and `POST /intents/:intentId/widen` controller paths now route through first-party protocol wrappers, so the mobile app’s intent follow-up actions share protocol event semantics with the rest of the first-party intent lifecycle.
- The direct inbox accept/reject controller paths now route through the same first-party protocol request-decision actions before hydrating the request response, so first-party HTTP request decisions share protocol event semantics with agent/runtime request decisions.
- The direct recurring-circle create and add-member controller paths now route through the same first-party protocol circle actions before hydrating circle responses, so first-party HTTP circle management shares protocol event semantics with agent/runtime circle actions.
- First-party agent circle creation and circle membership actions now call through the protocol service instead of bypassing it.
- Protocol-originated circle actions now emit provenance-backed user notifications, and first-party Activity can label them as integration updates without exposing protocol internals.
- Protocol-originated request send, request reject, accepted-request connection setup, and group backfill notifications now carry provenance through to user-facing Activity titles and notification metadata.
- Partner-facing SDK readiness is stronger:
  - package READMEs now document the actual shipped helpers
  - partner SDK index, manifest/discovery bootstrap, registration/token lifecycle, replay, webhook-consumer, consent/auth troubleshooting, operator recovery, compatibility guidance, production checklist, and agent quickstart guides are now in repo
  - partner example scripts now cover onboarding, actions, webhook consumption, operations, the thin agent wrapper, and toolset integration
  - the protocol client now supports creating a bound app client directly from a base URL and app session
  - the protocol client now supports loading an app operational snapshot for queue/auth/grant inspection
  - a thin `@opensocial/protocol-agent` wrapper now exists for actor defaults and readiness inspection without widening backend scope
  - the agent wrapper now includes readiness evaluation and fail-fast assertions for common auth/grant/queue blockers
  - the agent wrapper now exposes a generic toolset adapter so future orchestrators can consume stable protocol actions without runtime-specific SDK coupling
  - the agent wrapper now exposes a toolkit helper so orchestrators can consume the bound client and indexed tools together

Use this as the baseline for all next backlog items. Do not reintroduce generic social primitives like posts or follows.

## Progress Snapshot

- Protocol v0 resource shape and exclusions: shipped
- App registration and capability manifests: shipped
- Token issue/verify/rotate/revoke lifecycle: shipped, with remaining operational-policy hardening only
- Scoped grants and consent requests: shipped for the core user-grant path; broader `app|service|agent` enforcement remains partial
- Webhook subscriptions, delivery attempts, replay, dead-letter recovery, and queue inspection: shipped
- External action APIs for intents, requests, chats, and circles: shipped
- First-party HTTP call-through for the cleanest public write paths: shipped
- Partner-facing SDK packages, examples, and docs: effectively complete for v0
- First-party protocol settings/inspection surfaces: shipped as operational tooling, but still partial as polished product UX
- CI and product-critical golden coverage are green on the current mainline verification pass
- Mobile-critical backend controller coverage is verified for first-party protocol call-through on:
  - intents create, update, cancel, retry, and widen
  - inbox accept and reject
  - chat send
  - recurring-circle create and add-member

## Current Verification Focus

- verify the scheduled delivery runner and replay/dead-letter recovery under real failure conditions
- verify token/grant/auth diagnostics against remaining protocol-gated paths
- verify that protocol-originated user-facing events remain meaningful social states rather than generic integration copy
- verify whether the remaining first-party direct writes should become public protocol actions or remain intentionally internal

## Package Direction

The initial package family should be small and explicit:

- `@opensocial/protocol-types`
- `@opensocial/protocol-events`
- `@opensocial/protocol-client`
- `@opensocial/protocol-server`
- `@opensocial/protocol-agent`

These packages should mirror the backend domain rather than inventing new abstractions.

## Phased Backlog

### Now

1. Verify the shipped protocol v0 contract against the cleaned SDK surface.
   - Confirm manifest, discovery, examples, and client helpers still align with live backend routes.
   - Keep posts, follows, feeds, likes, and other generic social primitives explicitly excluded.
   - Treat docs plus examples as the v0 contract for partner consumption.
   - Status: verified against the current mainline CI and golden pass.

2. Tighten delegated-grant enforcement beyond the core user-grant path.
   - The schema and API support `subjectType=user|app|service|agent`.
   - Runtime enforcement is still centered on active user grants for delegated actions.
   - Decide whether `app|service|agent` subject types should remain modeled-only or become enforced execution paths.

3. Verify scheduled delivery execution and replay behavior under real failure conditions.
   - Signed webhook deliveries
   - Retry policy
   - Dead-letter replay
   - Queue health visibility
   - Replay cursor recovery

4. Review remaining first-party write-path normalization selectively.
   - Keep the public controller boundary protocol-owned.
   - Normalize additional internal flows only where the public protocol contract is already stable.
   - Avoid converting stable internal logic into protocol call-through just for consistency theater.
   - Mobile-spec-aligned controller paths are now covered for:
     - intent create, update, cancel, retry, and widen
     - inbox accept and reject
     - chat send
     - recurring-circle create and add-member
   - Remaining likely candidates should be judged against real mobile/product usage, not backend neatness alone.
   - Current review outcome:
     - `POST /intents/:intentId/convert`: needs contract decision
     - `POST /inbox/requests/:requestId/cancel`: needs contract decision
     - chat edit, reaction, and read-receipt flows: stay internal for now
     - recurring-circle update, archive, pause, resume, and remove-member flows: stay internal for now unless partner demand makes them real protocol actions

### Next

5. Harden token and credential policy beyond the shipped lifecycle mechanics.
   - App token issuance is already live.
   - Hashing, verification, rotation, and revocation are already live.
   - Remaining work is operational policy: expiry, refresh/reissue policy, and audit expectations.

6. Keep consent-request and delegated-access UX aligned with the backend model.
   - Consent requests and approve/reject flows are already live.
   - Remaining work is turning first-party settings from an operator surface into a cleaner consent/grant experience.
   - Do not broaden permission types unless a real partner flow demands it.

7. Expand user-facing protocol-aware presentation selectively.
   - Keep shared protocol client package and typed wrappers as the baseline.
   - Keep first-party settings surfaces aligned with token/grant/consent/replay operations.
   - Broader protocol-aware shell surfaces and event-driven product UX remain future work.
   - Render protocol-originated Activity items as user-meaningful social states, not operator jargon.

8. Keep the thin agent wrapper aligned with stable protocol actions.
   - The wrapper, readiness model, toolset, and toolkit are shipped.
   - Remaining work is runtime-specific orchestration guidance, not a second backend surface.
   - Add broader agent-specific protocol actions only if they fit the same coordination-first model.

### Later

11. Add partner-focused extension points.
   - Namespaced metadata
   - Namespaced custom events
   - Namespaced actions where explicitly allowed
   - Feature flags per app or tenant

12. Add protocol governance and compatibility policy.
   - Versioning rules
   - Deprecation windows
   - Backward compatibility guarantees
   - Breaking-change review process

13. Add operational docs and integration examples.
   - Sample third-party app flow
   - Sample agent flow
   - Event subscription example
   - Auth and scope example
   - Partner-facing SDK docs plan for app registration, auth token use, webhook subscriptions, replay, and consent/grants

## Backend Tasks

- Verify the event delivery worker and scheduled dispatch path under failure and recovery conditions.
- Tighten delegated-grant enforcement if `app|service|agent` subjects are meant to be executable, not just modeled.
- Review remaining first-party internal services and only normalize additional write paths where the public protocol contract is already stable.
- Keep audit logging and unsupported-primitive deny rules explicit as new actions are added.
- Keep queue observability, replay, and operator visibility aligned with the live delivery model.

## Auth and App Registration Tasks

- Keep the shipped app-registration flow aligned with the SDK contract and examples.
- Keep scoped API tokens for apps and agents aligned with the live auth checks.
- The core token lifecycle is shipped; remaining work is operational expiry/reissue policy, if needed.
- User-delegated consent is shipped for the core path; broader `service` and `agent` execution semantics remain a deliberate decision, not an implied future.
- Keep granted scopes and capability manifests explicit and revocable.
- Extend auth-failure diagnostics to any remaining protocol-gated paths that still fail without enough context.

## Event and Webhook Tasks

- Keep the shipped event taxonomy stable and explicit.
- Keep webhook subscriptions, signatures, retry, backoff, dead-letter handling, and replay aligned with the live queue path.
- Improve delivery observability and verification rather than rebuilding the delivery model.
- Keep event payloads versioned and backward-compatible as new event families are added.

## Frontend Wiring Tasks

- Keep the shared protocol client package as the integration baseline.
- Keep writable token, consent, grant, replay, and queue controls working in first-party settings surfaces.
- Tighten user-facing protocol-aware presentation without turning the app into a developer console.
- Keep the current product shell focused on Home, Activity, Chats, and Profile.
- Treat broader shell/event-stream integration as product-facing work, not SDK-completion work.

## Success Criteria

- A third-party app can register, request scopes, and call approved actions without backend internals.
- A third-party app can subscribe to relevant events and receive signed webhook delivery.
- Protocol state can survive restarts through persisted app, delivery, and replay cursor records.
- The frontend can consume the protocol through shared packages rather than bespoke one-off integrations.
- The core OpenSocial product remains intact and still omits unsupported social primitives like posts and follows.
- The protocol can scale to new clients and partners without exposing the whole backend surface.
- The existing mobile experience continues to work as the first-party reference implementation of the protocol.

## Open Questions

- Which actions should be user-delegated only versus service-level only?
- Which event families should be public by default versus partner-gated?
- What is the minimum replay retention window?
- Which namespaces are reserved for OpenSocial versus third parties?
- Which protocol primitives need versioning from day one?

## Immediate Execution Order

1. Verify the shipped SDK contract against live backend behavior.
2. Verify scheduled delivery, retry, dead-letter replay, and cursor recovery under failure.
3. Decide whether non-user grant subjects are enforcement targets or modeled-only for now.
4. Review remaining first-party internal write paths selectively and only normalize additional flows where the protocol contract is already stable.
   - First review candidates:
     - `POST /intents/:intentId/convert`
     - runtime commerce and dating actions where the mobile product actually depends on them
     - remaining agent/runtime helpers that still mix direct service writes with protocol call-through
5. Tighten operator/admin visibility for protocol lag, replay pressure, and token/grant audit usage where it is still thin.
6. Improve user-facing protocol-aware presentation in first-party surfaces without exposing backend internals.

## Current Direction Guardrails

- Keep the protocol centered on coordination primitives: intents, requests, connections, chats, circles, notifications, and events.
- Keep first-party UX user-facing. Surface integration state as meaningful social outcomes, not protocol jargon.
- Prefer provenance threading through existing domain flows over adding parallel protocol-only notification systems.
- Normalize first-party writes through protocol boundaries only when the public contract is already stable.
- Do not introduce posts, follows, feeds, or other generic social-network primitives.
