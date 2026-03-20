# Notifications, Delivery & Digests

## Goal

Ensure timely, relevant, and non-spammy delivery across:
- push
- email
- in-app inbox
- realtime in-session events
- digest summaries

---

## Delivery Channels

### In-App Inbox
Canonical source of truth for:
- incoming requests
- acceptances
- group invitations
- system notices

### Push
Used for:
- request received
- request accepted
- group formed
- high-confidence nearby opportunity (if user opted in)

### Email
Used for:
- digest summaries
- account/security notices
- unread connection summaries
- re-engagement campaigns (policy-controlled)

### Realtime Session Events
Used only when user is online:
- request received
- request accepted
- typing/presence updates
- group readiness

---

## Delivery Policy

1. Inbox first
2. Realtime if online
3. Push if allowed and meaningful
4. Email only for digest or recovery flows

Do not deliver the same event redundantly if user is active in session.

---

## Event Types

- intent.request.created
- intent.request.accepted
- intent.request.rejected
- group.proposal.ready
- group.member.accepted
- connection.created
- safety.warning
- digest.daily.ready

---

## BullMQ Queues

- notifications.dispatch
- notifications.push
- notifications.email
- notifications.digest
- notifications.cleanup

---

## Idempotency

Each notification event must have:
- event_id
- user_id
- channel
- dedupe_window_seconds

Store delivery receipts to prevent duplicates across retries.

---

## Digest System

### Digest Types
- daily social opportunities
- accepted but unopened chats
- dormant connection revival suggestions
- topic-specific opportunity digest

### Digest Inputs
- personalization rules
- unread interactions
- new high-confidence opportunities
- recently active contacts
- unfulfilled intents

### Digest Constraints
- only one digest per configured window
- respect quiet hours and locale
- do not include users blocked or filtered by rules

---

## Ranking for Notifications

Only notify if:
- confidence score exceeds threshold
- user rules allow interruption
- event is fresh
- user has not already acted via another channel

---

## Push Payload Design

Payload should include:
- event type
- short reason
- deep link
- redacted metadata only

Never include:
- exact location
- sensitive profile metadata
- moderation flags

---

## Failure Handling

- push failures retried with backoff
- invalid device tokens disabled
- email bounces tracked and suppressed
- digest generation failures sent to DLQ

---

## Metrics

- push CTR
- push disable rate
- request acceptance after push
- digest open rate
- time to action by channel
- duplicate delivery rate
