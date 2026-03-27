# Queue Contracts (Source of Truth)

This document is derived from live code in `packages/types/src/index.ts` and queue producers/consumers under `apps/api/src`.

## Queue registry
Registered in `apps/api/src/jobs/jobs.module.ts`:

- `intent-processing`
- `embedding`
- `matching`
- `request-fanout`
- `notification`
- `connection-setup`
- `moderation`
- `media-processing`
- `cleanup`
- `digests`
- `admin-maintenance`

Current active producers/consumers are implemented for `intent-processing`, `notification`, `connection-setup`, `moderation`, `media-processing`, `cleanup`, and `admin-maintenance`.

## Envelope schema
All typed queue messages use the envelope below (`queueEnvelopeSchema`):

```ts
{
  version: 1,
  traceId: string,        // UUID
  idempotencyKey: string,
  timestamp: string,      // ISO datetime
  type: string,
  payload: object
}
```

Validation entrypoint: `apps/api/src/jobs/queue-validation.ts`.

## Typed job contracts

### 1) `IntentCreated`
- Queue: `intent-processing`
- Producer(s): `IntentsService.createIntent`, `retryIntent`, delayed retry path
- Consumer: `IntentProcessingConsumer`
- Payload:

```ts
{
  intentId: string,       // UUID
  agentThreadId?: string  // UUID
}
```

- Idempotency key patterns:
  - `intent-created:<intentId>:initial`
  - `intent-created:<intentId>:manual:<traceId>`
  - `intent-created:<intentId>:fanout_followup|cap_reached|no_candidates|timeout_escalated`

### 2) `RequestAccepted`
- Queue: `connection-setup`
- Producer: `InboxService.updateStatus(..., "accepted")`
- Consumer: `ConnectionSetupConsumer`
- Payload:

```ts
{
  requestId: string,      // UUID
  intentId?: string       // UUID
}
```

- Idempotency key: `request-accepted:<requestId>`

### 3) `ProfilePhotoUploaded`
- Queue: `media-processing`
- Producer: `ProfilesService.completePhotoUpload`
- Consumer: `MediaProcessingConsumer`
- Payload:

```ts
{
  imageId: string,                                // UUID
  userId: string,                                 // UUID
  mimeType: "image/jpeg" | "image/png" | "image/webp"
}
```

- Idempotency key: `profile-photo-uploaded:<imageId>`

### 4) `AsyncAgentFollowup`
- Queue: `notification`
- Producer: `IntentsService.enqueueAsyncAgentFollowup`
- Consumer: `AsyncAgentFollowupConsumer`
- Payload:

```ts
{
  userId: string,                                 // UUID
  intentId: string,                               // UUID
  agentThreadId?: string,                         // UUID
  template: "pending_reminder" | "no_match_yet" | "progress_update",
  notificationType?: NotificationType,
  message?: string
}
```

- Idempotency key: `intent-followup:<intentId>:<template>`
- Launch-control gate: follows `enableAgentFollowups`; skipped when disabled.

### 5) `NotificationDispatch`
- Queue: `notification`
- Producer: `NotificationsService.enqueueDigestEmailDispatch`
- Consumer: `AsyncAgentFollowupConsumer` (digest-dispatch branch)
- Payload:

```ts
{
  notificationId: string,   // UUID
  recipientUserId: string,  // UUID
  notificationType: NotificationType
}
```

- Idempotency key: `notification-dispatch:<notificationId>:email_digest`

### 6) `RelayOutboxEvents` (internal admin maintenance)
- Queue: `admin-maintenance`
- Producer: Admin tooling path (queued maintenance)
- Consumer: `AdminMaintenanceConsumer`
- Payload (untyped by shared schema):

```ts
{
  limit?: number
}
```

- Default limit in consumer: `100`

### 7) `ChatMessageModerationRequested`
- Queue: `moderation`
- Producer: `ChatsService.createMessage` (strict moderation shadow-delivery path)
- Consumer: `ModerationConsumer`
- Payload:

```ts
{
  messageId: string,      // UUID
  chatId: string,         // UUID
  senderUserId: string,   // UUID
  body: string
}
```

- Idempotency key: `chat-message-moderation:<messageId>`

### 8) `ModerationDecisionRetentionCleanup`
- Queue: `cleanup`
- Producer: `POST /api/admin/maintenance/moderation-retention`
- Consumer: `CleanupConsumer`
- Payload (lightweight internal contract):

```ts
{
  version: 1,
  traceId: string,        // UUID
  idempotencyKey: string,
  timestamp: string,      // ISO datetime
  retentionDays: number
}
```

## Retry and backoff defaults
For typed producer jobs:
- `attempts: 3`
- exponential backoff with `delay: 1000`
- `removeOnComplete: 500`

## Dead-letter and replay contract
Dead-letter logic is in `DeadLetterService`:

- Failed jobs are persisted into `audit_logs` with `action=queue.job_dead_lettered`.
- Stalled jobs are persisted with `action=queue.job_stalled`.
- Replay endpoint re-enqueues payload with replay-specific idempotency key suffix.

Admin endpoints:
- `GET /api/admin/jobs/dead-letters`
- `POST /api/admin/jobs/dead-letters/:deadLetterId/replay`
- `GET /api/admin/jobs/queues`

## Compatibility rule
When adding/changing any queue payload:
1. Update schema in `packages/types/src/index.ts`.
2. Update producer payload + idempotency key behavior.
3. Update consumer validation via `validateQueuePayload`.
4. Add/adjust tests.
5. Update this document in the same change.
