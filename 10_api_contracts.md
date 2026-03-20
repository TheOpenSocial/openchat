# 10 — API Contracts

## API style
- REST for core application operations
- WebSocket for realtime events
- internal event contracts for async workflows

## Auth
- cookie session or short-lived access token + refresh flow
- authenticated endpoints require user context
- admin endpoints role-gated

## REST endpoints (initial)

### POST /v1/auth/google/callback
Finalize Google sign-in and create session.

### GET /v1/me
Return current user, profile summary, trust-safe fields.

### PATCH /v1/me/profile
Update profile fields:
- display_name
- bio
- interests
- availability defaults
- privacy

### POST /v1/me/avatar
Create upload intent / signed upload URL.

### POST /v1/intents
Request body:
```json
{
  "text": "I want to talk about yesterday's football match"
}
```

Response:
```json
{
  "intentId": "uuid",
  "status": "routing"
}
```

### GET /v1/intents/:intentId
Return intent status, parsed summary, request counts, accepted connections.

### POST /v1/requests/:requestId/respond
```json
{
  "action": "accept"
}
```

### GET /v1/requests/inbox
Paginated incoming request cards.

### GET /v1/connections
List active connections.

### GET /v1/connections/:connectionId/messages
Paginated messages.

### POST /v1/connections/:connectionId/messages
```json
{
  "clientMessageId": "uuid",
  "body": "Hey"
}
```

### POST /v1/reports
Create report.

### POST /v1/blocks
Block a user.

## WebSocket events

### Client -> server
- connection.authenticate
- chat.send
- chat.typing
- receipt.read
- presence.update

### Server -> client
- request.created
- request.updated
- intent.updated
- connection.created
- chat.message
- chat.receipt
- presence.changed
- moderation.notice

## Contract rules
- version all externally visible payloads
- validate all inputs with schema
- explicit enum values
- no hidden/implicit fields
- clientMessageId required for chat dedupe
