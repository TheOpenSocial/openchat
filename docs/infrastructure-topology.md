# Infrastructure Topology

## Staging environment topology
- 1x `api` service node (NestJS HTTP + WebSocket gateway).
- 1x `workers` service node (BullMQ processors).
- Managed PostgreSQL (single primary, daily backups enabled).
- Managed Redis (single node with AOF enabled).
- Object storage bucket + CDN distribution for media derivatives.
- Internal admin app behind authenticated route.

## Production environment topology
- N x `api` service nodes behind L7 ingress.
- N x `realtime` nodes (or co-located API websocket workers) behind sticky-session ingress.
- N x `workers` nodes split by queue class:
  - latency-sensitive (`intent-processing`, `connection-setup`, `notification`)
  - maintenance (`cleanup`, `digests`, `admin-maintenance`)
- Managed PostgreSQL with PITR, standby replica, and backup verification drills.
- Managed Redis with primary/replica and automatic failover.
- Object storage + CDN with private originals and signed derivative access where needed.

## WebSocket ingress and sticky sessions
- Ingress must support websocket upgrades and affinity.
- Sticky policy:
  - cookie or source-IP affinity for websocket connection continuity.
  - non-websocket REST traffic remains stateless/load-balanced.
- Multi-node propagation:
  - Redis adapter required for cross-node room and event fanout.
  - reconnect path must rehydrate chat state from Postgres.

## Database backup and restore policy
- Backup policy:
  - nightly full snapshot backups.
  - point-in-time recovery (PITR) continuous WAL archiving.
  - 30-day retention minimum in staging, 90-day in production.
- Restore policy:
  - monthly restore drill into isolated environment.
  - validate migration compatibility and critical table row counts.
  - maintain runbook for restore-to-point and service cutover.

## Redis persistence and failover strategy
- Persistence:
  - AOF (`appendfsync everysec`) enabled for queue durability.
  - periodic RDB snapshots for faster full restore.
- Failover:
  - Redis Sentinel or managed automatic failover.
  - alert on replication lag and role changes.
  - workers reconnect with exponential backoff and idempotent job handling.
