# Common Failure Guide

## API cannot start
Symptoms:
- bootstrap or DB connection errors.

Checks:
1. Run `pnpm db:up`.
2. Verify `DATABASE_URL` and `REDIS_URL`.
3. Run `pnpm db:generate`.

## Migration errors (`P3018`, missing relation/table)
Symptoms:
- `pnpm db:migrate` fails with prior migration drift/history mismatch.

Checks:
1. `pnpm db:migrate:status`
2. Ensure the DB points to the intended environment.
3. For local only, recreate DB and rerun migrations+seed.

## Queue jobs not processing
Symptoms:
- intent accepted but no connection/chat creation.

Checks:
1. `GET /api/admin/jobs/queues`
2. `GET /api/admin/jobs/dead-letters`
3. Replay with `/replay` endpoint.
4. Verify worker registration in `JobsModule`.

## Realtime events blocked unexpectedly
Symptoms:
- websocket connect/join/send returns disabled or blocked.

Checks:
1. `GET /api/admin/launch-controls`
2. Ensure `enableRealtimeChat=true` and `globalKillSwitch=false`.
3. Validate invite-only/cohort gating for test users.

## Push/digest notifications missing
Symptoms:
- notification created but not dispatched through expected channel.

Checks:
1. Confirm launch controls: `enablePushNotifications`.
2. Check notification channel field (`in_app`, `push`, `digest`).
3. Inspect `NotificationDispatch` queue jobs and audit logs.

## OAuth callback issues
Symptoms:
- Google callback fails or no user session issued.

Checks:
1. Validate `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`.
2. Ensure redirect URI matches Google OAuth configuration.
3. In local fallback mode, use deterministic test code path.
