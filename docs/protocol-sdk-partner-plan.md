# Partner-Facing Protocol SDK Docs Plan

This document defines the documentation set we should publish for the partner-facing protocol SDK. The goal is to make third-party integration straightforward without widening the protocol beyond the current product direction.

The SDK docs must stay aligned with what is already shipped:

- App registration is persisted.
- App tokens are issued, hashed, verified, rotated, and revoked.
- Webhook subscriptions are persisted and delivered through the protocol worker path.
- Replay cursors, delivery records, and dead-letter recovery exist.
- Scoped grants and consent requests are separate resources.
- External actions already exist for intents, requests, chats, and circles.
- Unsupported primitives remain unsupported, especially posts and follows.
- The protocol backend now explicitly advertises its unsupported-primitives policy in the manifest metadata so third parties do not infer support from omission.
- Usage summaries now expose structured protocol auth-failure diagnostics so partners can distinguish missing tokens, missing scopes, missing capabilities, and missing delegated grants.

## Doc Set Goals

- Give partners a clear integration path from app registration to first successful event delivery.
- Explain auth, scopes, and consent in terms of the actual protocol resources.
- Show how to consume webhooks and replay missed events safely.
- Make the SDK feel like a stable protocol layer, not a product-specific internal API dump.
- Keep the docs narrow around coordination primitives only.

## What We Should Publish

### 1. Protocol Overview

Audience: technical decision-makers and integration engineers.

Content:

- What OpenSocial protocol is.
- What it is not.
- Core resources:
  - identity
  - profile
  - intent
  - request
  - connection
  - chat
  - circle
  - notification
  - agent thread
  - realtime event
- Supported integration modes:
  - read state
  - write actions
  - event subscriptions
- Explicit exclusions:
  - posts
  - follows
  - feeds
  - likes
  - generic social-network primitives
- Explicit backend behavior:
  - the protocol manifest metadata includes an unsupported-primitives policy
  - the policy says posts, follows, feeds, and likes are intentionally outside the protocol surface
  - integrations should treat attempts to model those primitives as unsupported, not missing

### 2. App Registration Guide

Audience: partner engineers setting up their first app.

Content:

- How to register an app against the protocol service.
- What the app record stores.
- Required metadata:
  - app name
  - owner
  - redirect URIs
  - callback URLs
  - requested scopes
  - capability manifests
- How app tokens are issued and rotated.
- How token hashing and verification work at a high level.
- How to revoke an app or token.

Examples to include:

- Register a new app.
- Inspect the app record.
- Rotate a token.
- Revoke a token.

### 3. Auth and Scope Guide

Audience: partner engineers implementing secure access.

Content:

- Difference between app-level auth and delegated user grants.
- What `protocol_app_scope_grants` represents.
- Supported subject types:
  - user
  - app
  - service
  - agent
- Scope lifecycle:
  - active
  - revoked
- How consent requests resolve into grants.
- What happens when a scope is missing or revoked.
- How unsupported access is denied.
- How to inspect `authFailureCounts` and `recentAuthFailures` in usage summaries.

Examples to include:

- Use an app token to read allowed protocol state.
- Attempt a denied action and inspect the auth failure.
- Grant delegated access after consent approval.

### 4. Webhook Subscription Guide

Audience: partners consuming protocol events.

Content:

- How to create a webhook subscription.
- How event families are organized.
- What delivery records contain.
- How webhook signatures are generated and verified.
- How delivery retries and dead letters behave.
- How to inspect queue health and delivery status.

Examples to include:

- Subscribe to intent and request events.
- Verify a signed webhook payload.
- Inspect delivery status after a failed attempt.

### 5. Replay and Recovery Guide

Audience: partners operating an integration in production.

Content:

- What a replay cursor is.
- How the event log relates to delivery records.
- When to replay a single delivery versus a batch.
- How dead-letter recovery works.
- When to stop replaying and investigate a systemic failure instead.
- What replay does and does not guarantee.

Examples to include:

- Replay a single dead-lettered delivery.
- Replay all dead-lettered deliveries for an app.
- Resume consumption from a cursor after downtime.

### 6. Consent and Grants Guide

Audience: partners who need user-delegated access.

Content:

- The difference between a consent request and an active grant.
- Approval and rejection flow.
- How pending consent appears in first-party settings.
- How revocation behaves.
- How to model partial access without inventing new permission types.

Examples to include:

- Create a consent request.
- Approve a consent request and inspect the resulting grant.
- Reject a consent request.
- Revoke a grant and observe denied access.

### 7. External Actions Reference

Audience: partners implementing writable integrations.

Content:

- `intent.create`
- `request.send`
- `request.accept`
- `request.reject`
- `chat.send_message`
- `circle.create`
- `circle.join`
- `circle.leave`

For each action, the docs should list:

- required scope or capability
- who may invoke it
- what the action returns
- what events it emits
- common failure modes

### 8. Partner Quickstart

Audience: partners who want the full path in one place before diving into the reference docs.

Content:

- A minimal end-to-end walk through the shipped surface.
- Fetch the manifest and discovery document.
- Register an app and persist `appId` plus `appToken`.
- Use the token to inspect usage, grants, and consent requests.
- Subscribe to webhook events and inspect deliveries.
- Create a consent request and approve or reject it.
- Replay a single failed delivery and a dead-letter batch.
- Resume from a replay cursor after downtime.

The quickstart should link directly to the example doc and stay strictly within the supported coordination primitives.

Concrete links:

- [`docs/examples/protocol-partner-quickstart.md`](/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-partner-quickstart.md)
- [`scripts/examples/protocol-partner-onboarding.mjs`](/Users/cruciblelabs/Documents/openchat/scripts/examples/protocol-partner-onboarding.mjs)
- [`scripts/examples/protocol-partner-actions.mjs`](/Users/cruciblelabs/Documents/openchat/scripts/examples/protocol-partner-actions.mjs)

## Example Matrix

Each example should be small and scenario-based.

1. “Register a companion app”
2. “Subscribe to request and chat events”
3. “Send a webhook to your service and verify the signature”
4. “Recover from a missed event with replay”
5. “Request delegated access and await approval”
6. “Accept a request and start a chat”
7. “Create a circle and join it”

## Source of Truth

The docs should reference the shipped protocol surfaces rather than inventing new ones.

Relevant current surfaces:

- Protocol manifest, discovery, event catalog
- App registration and token lifecycle
- Webhook subscription, delivery, retry, and replay
- Consent requests and scoped grants
- Intent, request, chat, and circle external actions
- Usage summaries, token audits, grant audits, and queue health

The docs should not describe posts, follows, feeds, or any other generic social primitive as part of the protocol.

## Delivery Order

1. Publish the protocol overview and exclusions.
2. Publish app registration and auth/scope guides.
3. Publish webhook subscription and replay/recovery guides.
4. Publish consent and grants guidance.
5. Publish the external actions reference.
6. Add example snippets for each of the above.
7. Add one partner quickstart that walks through the whole path end to end.

## Acceptance Criteria

- A partner can read the docs and understand how to register an app, obtain and use an app token, subscribe to events, and recover missed deliveries.
- A partner can understand the difference between app auth and delegated consent.
- A partner can tell exactly which primitives are supported and which are intentionally excluded.
- The docs stay aligned with the current protocol backend surface and do not promise unsupported features.
- The docs remain focused on coordination and messaging, not generic social networking.
