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

2. Define app registration and capability manifests.
   - App identity and ownership
   - Redirect URIs and callback URLs
   - Client credentials or public keys
   - Requested scopes and capability grants
   - Allowed integration surfaces for read, write, and event consumption

3. Define scope enforcement and auditability.
   - User-delegated scopes
   - App-scoped permissions
   - Agent-scoped permissions
   - Revocation and token lifecycle
   - Audit trail for every third-party action

### Next

4. Build the event delivery model for external consumers.
   - Webhook subscriptions
   - Event signatures
   - Retry policy
   - Replay from cursor
   - Delivery status tracking

5. Define the external action APIs that third parties can call.
   - Create/update intents
   - Accept/reject requests
   - Send chat messages
   - Create or join circles
   - Publish notifications where allowed
   - Register agent activity where allowed

6. Add frontend wiring for protocol-aware clients.
   - Shared protocol client package for mobile/web
   - Typed API wrappers for protocol resources
   - Event stream consumption in the app shell
   - UI surfaces that can reflect third-party actions and inbound events

7. Add third-party agent integration support.
   - Agent registration
   - Event subscriptions by family
   - Scoped action execution
   - User-visible audit trail for agent actions

### Later

9. Add protocol replay and migration support.
   - Durable event log
   - Cursor-based replay
   - Backfill and migration tooling
   - Versioned event schemas

10. Add partner-focused extension points.
    - Namespaced metadata
    - Namespaced custom events
    - Namespaced actions where explicitly allowed
    - Feature flags per app or tenant

11. Add protocol governance and compatibility policy.
    - Versioning rules
    - Deprecation windows
    - Backward compatibility guarantees
    - Breaking-change review process

12. Add operational docs and integration examples.
    - Sample third-party app flow
    - Sample agent flow
    - Event subscription example
    - Auth and scope example

## Backend Tasks

- Define the v0 protocol resource and event vocabulary.
- Add app registration persistence and capability manifests.
- Add scope checks for every external action path.
- Add audit logging for all third-party and agent actions.
- Add explicit deny rules for unsupported primitives like posts and follows.
- Add signed webhook delivery with retry and replay support.
- Add event cursors and durable replay mechanics.

## Auth and App Registration Tasks

- Add an app registration flow.
- Support scoped API tokens for apps and agents.
- Support user-delegated consent where a third party acts on behalf of a user.
- Support service tokens where a third party integrates at the platform level.
- Record granted scopes and capability manifests.
- Make token issuance and revocation explicit.
- Make auth failures observable and diagnosable.

## Event and Webhook Tasks

- Define the event taxonomy for the protocol.
- Add webhook subscriptions per event family.
- Sign every webhook payload.
- Add retry, backoff, and dead-letter handling.
- Add replay from cursor for missed events.
- Add delivery observability so partners can see what was delivered and what failed.
- Keep event payloads versioned and backward-compatible.

## Frontend Wiring Tasks

- Add a shared protocol client package for mobile and web.
- Wire the frontend to protocol-backed reads instead of app-specific stitched endpoints where possible.
- Add UI affordances for third-party app activity and integrations.
- Add protocol-aware surfaces for external actions, event notifications, and agent activity.
- Keep the current product shell focused on Home, Activity, Chats, and Profile.
- Expose protocol state without turning the UI into a developer console.

## Success Criteria

- A third-party app can register, request scopes, and call approved actions without backend internals.
- A third-party app can subscribe to relevant events and receive signed webhook delivery.
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
2. Add app registration, capability manifests, and scope enforcement.
3. Add webhook subscriptions, signatures, and replay.
4. Wire the frontend to the protocol client package.
5. Add external action APIs and agent support.
