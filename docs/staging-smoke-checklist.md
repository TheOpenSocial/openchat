# Staging Smoke Checklist

Run order:
1. `pnpm db:migrate`
2. `pnpm db:seed`
3. Deploy API/web/admin to staging.
4. Execute the checks below.

Optional automation (backend smoke runner):
- Command: `pnpm staging:smoke:api`
- Required env for staging:
  - `SMOKE_BASE_URL` (for example `https://staging-api.example.com`)
  - `SMOKE_ADMIN_USER_ID`
  - `SMOKE_ADMIN_ROLE` (`admin`, `support`, or `moderator`; default `support`)
  - `SMOKE_ADMIN_API_KEY` (when admin middleware requires key)
  - `SMOKE_ACCESS_TOKEN` (optional bearer when access-token auth is enforced)
- The script verifies key read-only backend endpoints (`health`, admin `ops`, queue, dead-letter, and moderation agent-risk queue) and exits non-zero on any failing check.

## 1) Environment and Health
- [ ] `GET /api/health` returns success.
- [ ] `GET /api/admin/health` returns success with valid admin headers.
- [ ] Admin ops endpoints respond:
  - [ ] `GET /api/admin/ops/metrics`
  - [ ] `GET /api/admin/ops/alerts`

## 2) Auth and Session
- [ ] Google OAuth start endpoint resolves (`GET /api/auth/google`).
- [ ] Callback path resolves (`GET /api/auth/google/callback` with valid state/code).
- [ ] Refresh token rotation succeeds (`POST /api/auth/refresh`).

## 3) Intent -> Matching -> Inbox
- [ ] `POST /api/intents` creates an intent and queues processing.
- [ ] `GET /api/inbox/:userId/requests` returns pending/accepted requests.
- [ ] `POST /api/inbox/:requestId/accept` transitions to accepted.
- [ ] `POST /api/inbox/:requestId/reject` transitions to rejected.

## 4) Connection and Chat
- [ ] Connection setup job completes for accepted requests.
- [ ] `GET /api/chats/:chatId/messages` returns message history.
- [ ] `POST /api/chats/:chatId/messages` persists and fanouts message.
- [ ] `GET /api/chats/:chatId/sync` returns incremental sync payload.

## 5) Realtime and Notifications
- [ ] Realtime auth + room join succeed via websocket namespace `/realtime`.
- [ ] `chat.send` emits `chat.message` to subscribed participants.
- [ ] Notification creation/read flow works:
  - [ ] `GET /api/notifications/:userId`
  - [ ] `POST /api/notifications/:notificationId/read`

## 6) Launch Controls and Safety
- [ ] `GET /api/admin/launch-controls` returns current snapshot.
- [ ] Toggle `enableNewIntents=false`; verify `POST /api/intents` is blocked.
- [ ] Toggle `enableRealtimeChat=false`; verify websocket chat events are blocked.
- [ ] Toggle `inviteOnlyMode=true` with cohort list; verify non-cohort users are blocked.

## 7) Queue and Resilience
- [ ] Intent-processing queue consumes `IntentCreated` jobs.
- [ ] Notification queue consumes `AsyncAgentFollowup` and `NotificationDispatch`.
- [ ] Dead-letter endpoints remain operational:
  - [ ] `GET /api/admin/jobs/dead-letters`
  - [ ] `POST /api/admin/jobs/dead-letters/:deadLetterId/replay`

## 8) Rollout gates (prod approval)
Cross-check with `PROGRESS.md` §31 before promoting to production:
- [ ] Observability: traces/metrics visible for API + workers; alert endpoint (`GET /api/admin/ops/alerts`) reviewed for a quiet baseline.
- [ ] Incident path: on-call can follow `docs/incident-runbook.md` using current dashboards/links.
- [ ] Launch controls: feature flags and kill switches exercised in staging (`GET /api/admin/launch-controls`, toggles verified).
- [ ] Cohort / invite-only: if enabled, non-cohort denial tested.
- [ ] Frontend smoke: mobile Maestro critical path (local-mode) and/or web design-mock Playwright (`pnpm --filter @opensocial/web test:e2e`) green on a release candidate build; optional manual pass of **Home → Chats → Profile** on staging web/mobile against live API.
