# Incident Runbook

## Severity model
- Sev-1: core flow outage (auth, intent creation, inbox accept, chat send/realtime)
- Sev-2: major degradation (queue backlog growth, elevated failures, moderation stuck)
- Sev-3: non-critical defect with workaround

## Immediate response
1. Declare incident and assign owner.
2. Freeze risky deploys and non-essential changes.
3. Capture current UTC timestamp, impact scope, and affected services.

## Triage checklist
1. Health and alerts
- `GET /api/health`
- `GET /api/admin/ops/alerts`
- `GET /api/admin/ops/metrics`

2. Queue state
- `GET /api/admin/jobs/queues`
- `GET /api/admin/jobs/dead-letters`

3. Launch controls
- `GET /api/admin/launch-controls`
- apply containment toggles if needed:
  - disable new intents
  - disable realtime chat
  - enable invite-only mode

4. Data safety
- verify migration status before running any schema changes
- avoid destructive DB actions in staging/prod incident windows

## Containment playbook
- If routing pipeline is unstable:
  - set `enableNewIntents=false`
  - continue processing existing intents while debugging
- If realtime is unstable:
  - set `enableRealtimeChat=false`
  - keep REST chat endpoints available
- If abuse or policy breach spike:
  - set `enableModerationStrictness=true`

## Recovery
1. Apply fix.
2. Replay dead letters where safe.
3. Validate with smoke checklist (`docs/staging-smoke-checklist.md`).
4. Re-enable disabled launch controls in controlled order.

## Post-incident
- Write timeline with absolute UTC timestamps.
- Document root cause, impact, and prevention actions.
- Update `PROGRESS.md` Implementation Notes and relevant runbook sections.
