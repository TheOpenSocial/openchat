# Data Retention and Archive Strategy

## Scope
- `chat_messages`
- `audit_logs`
- `user_preferences` keys with prefix `moderation.decision.v1:`

## Strategy
1. Keep recent records in primary tables for low-latency product paths.
2. Archive old records into:
   - `chat_messages_archive`
   - `audit_logs_archive`
3. Preserve source IDs in archive tables (`source_message_id`, `source_audit_log_id`) for deterministic replay and audit traceability.
4. Index archive tables by original event time and archive timestamp for efficient backfills and compliance export workloads.

## Suggested windows
- `chat_messages`: archive after 180 days.
- `audit_logs`: archive after 365 days.
- `moderation decisions`: delete after 180 days (configurable via `MODERATION_DECISION_RETENTION_DAYS`).

## Operational model
- Run archival jobs in the existing `cleanup` queue.
- Use copy-then-delete batches ordered by source primary key for deterministic behavior.
- Record job-level counts and cutoffs in operational logs.
- Queue job name for moderation decision cleanup: `ModerationDecisionRetentionCleanup`.

## Safety rules
- Never archive rows that are already archived (enforced by source ID unique keys).
- Execute archive batches in transactions.
- Preserve UTC timestamps when moving rows.
