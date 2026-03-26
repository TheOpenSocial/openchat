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
  - `SMOKE_USE_UNIQUE_IP` (`true` by default for localhost; set `false` to test strict per-IP abuse throttling behavior)
- The script verifies key read-only backend endpoints (`health`, admin `ops`, queue, dead-letter, and moderation agent-risk queue) and exits non-zero on any failing check.

Optional automation (incident/readiness verification):
- Command: `pnpm staging:verify:incident`
- Required env for staging:
  - `SMOKE_BASE_URL`
  - `SMOKE_ADMIN_USER_ID`
  - `SMOKE_ADMIN_ROLE` (`admin`, `support`, or `moderator`; default `support`)
  - `SMOKE_ADMIN_API_KEY` (when admin middleware requires key)
  - `SMOKE_ACCESS_TOKEN` (optional bearer when access-token auth is enforced)
- Optional controls:
  - `INCIDENT_VERIFY_REQUIRE_HEALTHY` (`true` by default; fail if `ops/alerts` summary is not `healthy`)
  - `INCIDENT_VERIFY_FAIL_ON_WARNING` (`false` by default; when `true`, fail on warning alerts too)
  - `INCIDENT_VERIFY_RUNBOOKS` (`true` by default; validates core runbook files exist)
  - `INCIDENT_VERIFY_SKIP_HTTP` (`false` by default; when `true`, skips network checks and verifies runbook-path readiness only)
  - `INCIDENT_VERIFY_RUNBOOK_FILES` (comma-separated file list override)
- The script verifies health, `ops/alerts`, `ops/metrics`, launch controls, queue visibility, and runbook-path presence; exits non-zero on readiness failures.

Optional automation (full backend launch pack):
- Command: `pnpm test:backend:ops-pack`
- Runs: release gate + Golden Suite verification lane + smoke lane + moderation drill.
- Writes machine-readable artifact at `.artifacts/backend-ops-pack/<run-id>.json`.
- Useful for TP-11/TP-12 readiness and launch go/no-go evidence.
- For temporary staging=prod parity:
  - `STAGING_EQUALS_PROD=true BACKEND_OPS_TARGET=staging pnpm test:backend:ops-pack`
  - verification scripts will resolve `STAGING_*` keys from `PROD_*`/`PRODUCTION_*` aliases when staging keys are missing.

Optional automation (moderation drill):
- Command: `pnpm moderation:drill`
- Use this to verify the full moderation operator loop in a deployed environment: report -> flag visibility -> assignment -> triage -> audit trail -> optional enforcement verification.
- Required env when creating a fresh report:
  - `SMOKE_BASE_URL`
  - `SMOKE_ADMIN_USER_ID`
  - `SMOKE_ADMIN_ROLE`
  - `MODERATION_DRILL_REPORTER_USER_ID`
  - `MODERATION_DRILL_ACCESS_TOKEN`
  - `MODERATION_DRILL_TARGET_USER_ID`
- Optional env:
  - `SMOKE_ADMIN_API_KEY`
  - `SMOKE_ACCESS_TOKEN`
  - `MODERATION_DRILL_EXISTING_FLAG_ID` (skip report creation and start from an existing flag)
  - `MODERATION_DRILL_ENTITY_TYPE` / `MODERATION_DRILL_ENTITY_ID` (defaults to `user` / target user)
  - `MODERATION_DRILL_ASSIGN_TO_USER_ID`
  - `MODERATION_DRILL_ACTION` (`resolve` by default; `restrict_user` and `escalate_strike` verify enforcement paths)
  - `MODERATION_DRILL_TRIAGE_REASON`, `MODERATION_DRILL_ASSIGN_REASON`, `MODERATION_DRILL_STRIKE_REASON`
- Safety default: the drill defaults to `MODERATION_DRILL_ACTION=resolve`, so it is non-destructive unless you explicitly opt into enforcement verification.

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
- [ ] Moderation drill executed in a deployed environment with `pnpm moderation:drill`; verify queue visibility, assignment, triage, audit trail, and any selected enforcement path.
