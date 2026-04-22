# Admin Runbook

## Required headers
- `x-admin-user-id` (UUID)
- `x-admin-role` (`admin`, `support`, `moderator`)
- `x-admin-api-key` when enabled for non-browser admin callers

## Web dashboard sign-in (`apps/admin`)
- Operators sign in with **Google**; the API issues a normal user session and the UI uses that user’s id as `x-admin-user-id`.
- Configure **`ADMIN_ALLOWED_USER_IDS`** / **`ADMIN_ROLE_BINDINGS`** so only intended accounts can call `/api/admin/*`.
- Keep **`ADMIN_API_KEY`** empty for the hosted admin dashboard. The browser UI does not send `x-admin-api-key`; use the key only for scripts or tooling that can inject the header directly.
- Set **`ADMIN_DASHBOARD_REDIRECT_URIS`** to the full admin callback URL (e.g. `https://admin.example.com/auth/callback`). For local dev, `http://localhost:3001/auth/callback` works when the variable is unset.
- Google OAuth still uses **`GOOGLE_REDIRECT_URI`** pointing at the **API** (`…/api/auth/google/callback`); the API then redirects the browser to the admin callback with `?code=`.
- Agent thread **SSE** in the admin UI authenticates via **`access_token`** query on the stream URL only; avoid logging full stream URLs in production.

## Daily checks
1. Health
- `GET /api/admin/health`

2. Runtime ops
- `GET /api/admin/ops/metrics`
- `GET /api/admin/ops/alerts`
- `GET /api/admin/ops/llm-runtime-health` (primary onboarding/agentic runtime triage snapshot)
- In `ops/metrics`, track:
  - `queueDepth` (`waiting`, `active`, `delayed`, `failed`) per queue for backlog pressure
  - `moderationRates.moderationDecisionReviews24h` and `moderationRates.overturnRate24h`
  - `moderationRuntime.bySource.human` to monitor human-review load vs automated decisions

3. Queue state
- `GET /api/admin/jobs/queues`
- `GET /api/admin/jobs/dead-letters`
- Queue workers with dead-letter capture include `moderation` and `cleanup`; replay from dead letters when terminal retries are exhausted.

4. Moderation backlog
- `GET /api/admin/moderation/queue`
- `pnpm moderation:drill` for end-to-end operator verification in staging/prod
- Daily retention cleanup auto-enqueues on `POST /api/inbox/requests/expire-stale` cron path.
- Manual backstop: `POST /api/admin/maintenance/moderation-retention`

5. Backend launch evidence pack
- `pnpm test:backend:ops-pack`
- Artifact: `.artifacts/backend-ops-pack/<run-id>.json`

## Core operations
- Replay intent workflow: `POST /api/admin/intents/:intentId/replay`
- Inspect routing explanation: `GET /api/admin/intents/:intentId/routing-explanations`
- Resend notification: `POST /api/admin/users/:userId/notifications/resend`
- Repair chat flow: `POST /api/admin/chats/:chatId/repair`
- Deactivate account: `POST /api/admin/users/:userId/deactivate`
- Restrict account: `POST /api/admin/users/:userId/restrict`
- Submit direct human moderation decision: `POST /api/admin/moderation/decisions/:decisionId/review`
- Triage + link to moderation decision in one action:
  - `POST /api/admin/moderation/flags/:flagId/triage`
  - body supports optional `decisionId` and `humanReviewAction` (`approve`, `reject`, `escalate`)

## Moderation drill
- Default command: `pnpm moderation:drill`
- Safe default: resolves a flag without applying enforcement unless you set `MODERATION_DRILL_ACTION` to `restrict_user` or `escalate_strike`.
- Use `MODERATION_DRILL_EXISTING_FLAG_ID` when you want to validate triage/audit behavior without creating a new report.
- For a full synthetic flow, provide a reporter session and target user so the drill can create a report and verify the generated moderation flag appears in the admin queue.

## Launch controls
- View: `GET /api/admin/launch-controls`
- Update: `POST /api/admin/launch-controls`
- Launch-control mutations now require an `admin` role and should include a `reason` when enabling invite-only mode, enabling the global kill switch, or disabling any feature gate.

High-impact toggles:
- `enableNewIntents`
- `enableRealtimeChat`
- `enablePushNotifications`
- `globalKillSwitch`
- `inviteOnlyMode` + `alphaCohortUserIds`

## Scheduled-task admin operations
- Inspect: `GET /api/admin/scheduled-tasks`
- Inspect runs: `GET /api/admin/scheduled-tasks/:taskId/runs`
- Pause: `POST /api/admin/scheduled-tasks/:taskId/pause`
- Resume: `POST /api/admin/scheduled-tasks/:taskId/resume`
- Archive: `POST /api/admin/scheduled-tasks/:taskId/archive`
- Run now: `POST /api/admin/scheduled-tasks/:taskId/run-now`
- These mutations are admin-only and should include a short `reason` for audit clarity.

## Escalation criteria
Escalate to incident runbook when:
- dead letters continue growing after replay attempts
- queue backlog breaches alert thresholds
- moderation backlog breaches threshold
- realtime or auth outage impacts core flow
- OpenAI circuit is open (`/api/admin/ops/llm-runtime-health` budget section) and moderation queue backlog is rising.

## Onboarding inference lifecycle contract
Treat onboarding infer responses as additive but stable when `lifecycle` is present:
- `infer-started`: server accepted inference request
- `infer-processing`: runtime is actively resolving model output
- `infer-success`: structured model response accepted
- `infer-fallback`: deterministic fallback payload returned due to timeout/error/unavailable model

Operational expectation:
- sustained `infer-fallback` increase + rising `onboarding.fallbackRate` in `/api/admin/ops/llm-runtime-health` should trigger runtime investigation and model timeout/policy review.
