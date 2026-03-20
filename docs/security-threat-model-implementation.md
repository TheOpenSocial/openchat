# Security Threat Model Implementation

Last updated: 2026-03-20

This document maps `16_security_threat_model.md` requirements to implemented backend controls and remaining hardening items.

## Implemented controls

### Identity and session
- OAuth callback validation and robust Google exchange/fallback behavior (`apps/api/src/auth/auth.service.ts`).
- Session persistence, refresh rotation, mismatch revocation, suspicious-login outbox hooks (`apps/api/src/auth/auth.service.ts`).
- Auth audit trail for login/session/refresh/revoke events (`audit_logs` writes in auth service).

### API and abuse prevention
- Request-level fixed-window rate limiting for global, write, and auth paths (`apps/api/src/common/request-security.middleware.ts`).
- Abuse throttling with high-risk endpoint weighting and temporary block windows (`apps/api/src/common/request-security.middleware.ts`).
- Structured security events for throttle/limit enforcement in logs.

### Realtime
- Socket identity checks on connect/authenticate and schema validation for inbound/outbound realtime payloads (`apps/api/src/realtime/realtime.gateway.ts`).
- Websocket error instrumentation for unauthorized/payload/replay failures (`apps/api/src/common/ops-metrics.ts` + gateway hooks).

### Storage/media
- Signed upload intents for profile photos.
- Upload completion now requires signed token validation with expiry, object/path/mime/byte-size matching, and min/max size checks (`apps/api/src/profiles/profiles.service.ts`).
- Queue-backed photo moderation and moderation notice delivery retained.

### Admin and RBAC
- Existing controller-level role gates retained.
- Added admin access middleware with optional API key requirement, user allowlist, and user-role binding validation (`apps/api/src/admin/admin-security.middleware.ts`).
- Admin actions remain audit-logged.

### AI-specific controls
- Prompt-injection guardrails added in `@opensocial/openai`: suspicious policy/tool override patterns trigger safe fallback behavior and are captured in failure telemetry (`packages/openai/src/index.ts`).
- OpenAI request metadata now links app trace IDs and active OTel span context.

### Observability and incident response support
- OpenTelemetry SDK bootstrap with OTLP exporter and span context propagation across API request and worker paths (`apps/api/src/common/otel-bootstrap.ts`, `apps/api/src/common/tracing.ts`).
- Admin alert surface for queue stalled/backlog, websocket error spikes, DB latency saturation, OpenAI error spikes, and moderation backlog (`GET /api/admin/ops/alerts`).

## Remaining high-priority security gaps

- Secrets rotation policy enforcement across all runtime secrets (JWT and integration secrets).
- Encryption-at-rest/in-transit enforcement checks (environment and infra policy validation in runtime/startup paths).
- Dependency currency automation in CI (beyond local scripts).
- Threat-model verification drills in staging.

## Operational commands

- Dependency currency report:
  - `pnpm deps:outdated`
  - `pnpm deps:outdated:latest`
- Update to latest versions:
  - `pnpm deps:update:latest`
