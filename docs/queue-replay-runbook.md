# Queue Replay Runbook

## Purpose
Recover failed async workflows by replaying dead-lettered jobs safely.

## Preconditions
- Admin credentials and headers:
  - `x-admin-user-id`
  - `x-admin-role` (support/admin)
  - `x-admin-api-key` if configured
- Root cause assessed (do not replay blindly on active systemic failures).

## Procedure
1. List dead letters:
   - `GET /api/admin/jobs/dead-letters`
2. Select candidate job by:
   - queue name
   - job name
   - failure reason
   - replay count
3. Replay:
   - `POST /api/admin/jobs/dead-letters/:deadLetterId/replay`
4. Monitor:
   - `GET /api/admin/jobs/queues`
   - relevant domain endpoint (intent/chat/profile state)
   - `audit_logs` entries for `queue.job_replayed`

## Safety rules
- Replay one representative job first.
- Confirm idempotency-key behavior before bulk replay.
- If replay fails repeatedly, stop and escalate incident.
- Capture incident notes with dead-letter ids and timestamps.

## Validation checklist
- [ ] Replay accepted by API.
- [ ] Queue backlog decreases.
- [ ] Domain state reaches expected status.
- [ ] No duplicate side effects observed.
