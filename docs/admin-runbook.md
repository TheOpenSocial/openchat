# Admin Runbook

## Required headers
- `x-admin-user-id` (UUID)
- `x-admin-role` (`admin`, `support`, `moderator`)
- `x-admin-api-key` when enabled

## Web dashboard sign-in (`apps/admin`)
- Operators sign in with **Google**; the API issues a normal user session and the UI uses that user’s id as `x-admin-user-id`.
- Configure **`ADMIN_ALLOWED_USER_IDS`** / **`ADMIN_ROLE_BINDINGS`** so only intended accounts can call `/api/admin/*`.
- Set **`ADMIN_DASHBOARD_REDIRECT_URIS`** to the full admin callback URL (e.g. `https://admin.example.com/auth/callback`). For local dev, `http://localhost:3001/auth/callback` works when the variable is unset.
- Google OAuth still uses **`GOOGLE_REDIRECT_URI`** pointing at the **API** (`…/api/auth/google/callback`); the API then redirects the browser to the admin callback with `?code=`.
- Agent thread **SSE** in the admin UI authenticates via **`access_token`** query on the stream URL only; avoid logging full stream URLs in production.

## Daily checks
1. Health
- `GET /api/admin/health`

2. Runtime ops
- `GET /api/admin/ops/metrics`
- `GET /api/admin/ops/alerts`

3. Queue state
- `GET /api/admin/jobs/queues`
- `GET /api/admin/jobs/dead-letters`

4. Moderation backlog
- `GET /api/admin/moderation/queue`

## Core operations
- Replay intent workflow: `POST /api/admin/intents/:intentId/replay`
- Inspect routing explanation: `GET /api/admin/intents/:intentId/routing-explanations`
- Resend notification: `POST /api/admin/users/:userId/notifications/resend`
- Repair chat flow: `POST /api/admin/chats/:chatId/repair`
- Deactivate account: `POST /api/admin/users/:userId/deactivate`
- Restrict account: `POST /api/admin/users/:userId/restrict`

## Launch controls
- View: `GET /api/admin/launch-controls`
- Update: `POST /api/admin/launch-controls`

High-impact toggles:
- `enableNewIntents`
- `enableRealtimeChat`
- `enablePushNotifications`
- `globalKillSwitch`
- `inviteOnlyMode` + `alphaCohortUserIds`

## Escalation criteria
Escalate to incident runbook when:
- dead letters continue growing after replay attempts
- queue backlog breaches alert thresholds
- moderation backlog breaches threshold
- realtime or auth outage impacts core flow
