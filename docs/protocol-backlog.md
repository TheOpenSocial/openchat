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
- First-party mobile and web settings surfaces now support token rotate/revoke and grant creation/revocation flows for protocol apps.
- First-party mobile and web settings surfaces now frame grants as delegated access and expose dead-letter replay controls.
- First-party runtime and agent intent/request flows now have protocol-service call-through paths for the cleanest social actions.
- First-party agent circle creation and circle membership actions now call through the protocol service instead of bypassing it.
- Protocol-originated circle actions now emit provenance-backed user notifications, and first-party Activity can label them as integration updates without exposing protocol internals.
- Protocol-originated request send, request reject, accepted-request connection setup, and group backfill notifications now carry provenance through to user-facing Activity titles and notification metadata.

Use this as the baseline for all next backlog items. Do not reintroduce generic social primitives like posts or follows.

## Package Direction

The initial package family should be small and explicit:

- `@opensocial/protocol-types`
- `@opensocial/protocol-events`
- `@opensocial/protocol-client`
- `@opensocial/protocol-server`
- `@opensocial/protocol-agent` later, if needed

These packages should mirror the backend domain rather than inventing new abstractions.

## Phased Backlog

### Now

1. Define the protocol v0 contract for external apps.
   - Confirm the core resources: identity, profile, intent, request, connection, chat, circle, notification, agent thread, and realtime event.
   - Explicitly exclude posts, follows, feeds, likes, and other generic social primitives.
   - Lock the namespace rules for core events versus third-party extensions.

2. Define scoped grants on top of persisted protocol app rows.
   - Use `protocol_app_scope_grants` as the grant store.
   - Support `subjectType=user|app|service|agent`.
   - Keep grant status lifecycle minimal: `active`, `revoked`.
   - Audit every grant and revocation.

3. Define app registration and capability manifests as the base contract.
   - App identity and ownership
   - Redirect URIs and callback URLs
   - Client credentials or public keys
   - Requested scopes and capability grants
   - Allowed integration surfaces for read, write, and event consumption

4. Define the persistence model for protocol replay and delivery records.
   - Durable protocol event log
   - Replay cursors and cursor state envelopes
   - Webhook subscription persistence
   - Delivery record persistence
   - Snapshotting or cache-backed state recovery where needed

### Next

5. Harden the scheduled event delivery runner for external consumers.
   - Webhook subscriptions
   - Event signatures
   - Retry policy
   - Replay from cursor
   - Delivery attempt history and delivery status tracking
   - Queue processing and backoff behavior
   - Dead-letter handling and recovery
   - Scheduled dispatch path for due deliveries across apps

6. Tighten token management and app credential lifecycle.
   - App token issuance
   - Token hashing and verification
   - Rotation and revocation
   - Expiry and refresh policy where applicable
   - Audit trail for credential use
   - First-party write controls and visibility into token/grant audit state

7. Expand consent-request enforcement for third-party access.
   - Resolve consent requests into active grants without mixing request lifecycle into grant status.
   - Support approval and rejection flows with audit history.
   - Surface pending consent requests in first-party settings on mobile and web.
   - Extend request lifecycles beyond manual approve/reject only if a real partner flow needs it.
   - Deny unsupported primitives like posts and follows.

8. Define the external action APIs that third parties can call.
   - Create/update intents
   - Accept/reject requests
   - Send chat messages
   - Create or join circles
   - Publish notifications where allowed
   - Register agent activity where allowed

9. Expand frontend wiring for protocol-aware clients.
   - Keep shared protocol client package and typed wrappers as the baseline.
   - Add event stream consumption in the app shell where protocol events become user-visible.
   - Tighten first-party surfaces that reflect third-party actions and inbound events.
   - Render protocol-originated Activity items as user-meaningful social states, not operator jargon.
   - Expose protocol state without turning the UI into a developer console.

10. Add third-party agent integration support.
   - Agent registration
   - Event subscriptions by family
   - Scoped action execution
   - User-visible audit trail for agent actions

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

## Backend Tasks

- Ship the event delivery worker for external consumers.
- Wire rotate/revoke lifecycle through persisted protocol app rows and audit events.
- Surface `protocol_app_scope_grants` through the protocol API and enforce them against persisted grant rows.
- Add scope checks for every external action path.
- Add audit logging for all third-party and agent actions.
- Add explicit deny rules for unsupported primitives like posts and follows.
- Add signed webhook delivery with retry and replay support.
- Persist delivery attempts and expose queue observability for operators and app owners.
- Add cursor-based replay mechanics and stateful replay envelopes.

## Auth and App Registration Tasks

- Add an app registration flow.
- Support scoped API tokens for apps and agents.
- Add token hashing, verification, rotation, and revocation.
- Support user-delegated consent where a third party acts on behalf of a user.
- Support service tokens where a third party integrates at the platform level.
- Record granted scopes and capability manifests.
- Make grants explicit and revocable through `protocol_app_scope_grants`.
- Make auth failures observable and diagnosable.

## Event and Webhook Tasks

- Define the event taxonomy for the protocol.
- Add webhook subscriptions per event family.
- Sign every webhook payload.
- Add retry, backoff, and dead-letter handling in the delivery worker.
- Add replay from cursor for missed events and expose cursor state to clients.
- Add delivery observability so partners can see what was delivered and what failed.
- Keep event payloads versioned and backward-compatible.

## Frontend Wiring Tasks

- Add a shared protocol client package for mobile and web.
- Wire the frontend to protocol-backed reads instead of app-specific stitched endpoints where possible.
- Add UI affordances for third-party app activity, consent requests, grants, and integrations.
- Add writable token, consent, and grant controls to first-party protocol settings surfaces.
- Add protocol-aware surfaces for external actions, event notifications, and agent activity.
- Keep the current product shell focused on Home, Activity, Chats, and Profile.
- Add protocol surfaces that are visible to users without turning the app into a developer console.
- Expose protocol state without turning the UI into a developer console.

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

1. Finalize protocol resources, event names, and exclusions.
2. Expand consent-request lifecycle and approval policy on persisted app rows.
3. Normalize protocol-backed first-party action paths beyond chat send, intent, request, and recurring-circle actions.
4. Add operator/admin visibility for protocol lag, replay pressure, and token/grant audit usage.
5. Add the next external action APIs and agent support beyond circles.
6. Expand user-visible protocol events in first-party activity surfaces beyond circle notifications, without exposing backend internals.

## Current Direction Guardrails

- Keep the protocol centered on coordination primitives: intents, requests, connections, chats, circles, notifications, and events.
- Keep first-party UX user-facing. Surface integration state as meaningful social outcomes, not protocol jargon.
- Prefer provenance threading through existing domain flows over adding parallel protocol-only notification systems.
- Normalize first-party writes through protocol boundaries only when the public contract is already stable.
- Do not introduce posts, follows, feeds, or other generic social-network primitives.
