# Protocol Backlog

This backlog defines the protocol layer we want to keep focused and extensible.

The protocol should expose real coordination primitives, not a generic social feed.
It should support third-party apps through scoped actions, replayable queue-backed delivery, and clear usage visibility.

## Scope

Keep:
- identity and profile
- intents and intent requests
- chats and groups
- notifications
- protocol apps and webhooks
- app-scoped grants and capabilities
- replayable queue-backed delivery
- usage visibility and audit trails

Omit:
- posts
- follows
- generic feed primitives
- vanity social graph abstractions that do not map to coordination

## Workstream 1: Queue-Backed Delivery Dispatch

Goal: make protocol delivery deterministic, replayable, and observable.

Tasks:
- keep delivery execution behind a queue-backed runner
- preserve stable job ids and idempotency keys for deliveries
- record success, failure, retry, and dead-letter transitions
- expose replay semantics for failed deliveries
- keep scheduled dispatch and manual dispatch on the same execution path

Acceptance criteria:
- due deliveries are claimed through a queue-backed runner
- delivery retries are visible in audit history
- dead-lettered deliveries can be replayed with deterministic replay ids
- manual dispatch produces the same visible contract as scheduled dispatch

## Workstream 2: Usage Visibility

Goal: let operators and third-party apps see what the protocol is doing.

Tasks:
- surface app registration state
- surface app tokens, scopes, and grants
- surface webhook subscription state
- surface delivery queue status and replayability
- surface dead-letter and stalled-job history
- keep admin queue views aligned with the delivery model

Acceptance criteria:
- a registered app can see its current scopes and grants
- webhook subscriptions are discoverable and auditable
- delivery failures are visible without reading internal logs
- queue depth / lag / dead-letter views stay consistent with runtime behavior

## Workstream 3: External Actions

Goal: let third-party apps invoke protocol-safe actions through grants.

Tasks:
- protect request accept/reject paths behind app grants
- protect chat message send paths behind app grants
- keep protocol actions scoped to the explicit capability model
- reject unsupported actions instead of widening the surface

Acceptance criteria:
- app actions require app token plus matching capability
- delegated user actions require a grant row
- revoked grants stop subsequent actions

## Workstream 4: Frontend Visibility

Goal: show protocol usage without turning the app into a console.

Tasks:
- keep protocol settings visible in mobile and web
- show registered apps, scopes, webhook subscriptions, and grant status
- keep the UI light: status, usage, and management only

Acceptance criteria:
- a user can inspect registered apps and current grants from settings
- usage data is visible without leaving the product shell
- no feed-style or admin-dashboard-style protocol UI leaks into the main product surfaces

## Completed Slices

- Added a typed protocol visibility summary read model for mobile/settings usage.
- Exposed `GET /protocol/visibility-summary` from the backend.
- Added `getVisibilitySummary()` to `@opensocial/protocol-client`.
- Wired the mobile Settings protocol panel to the summary through React Query.

## Tests To Keep

- queue dispatch tests for scheduled and manual runs
- dead-letter replay tests
- stalled-job visibility tests
- queue overview / lag visibility tests
- grant enforcement tests for protocol actions

## Non-Negotiables

- Do not add posts/feed primitives to the protocol core.
- Do not skip queue-backed delivery for direct synchronous dispatch.
- Do not expose external actions without grant checks.
- Do not hide queue failures from usage visibility.
