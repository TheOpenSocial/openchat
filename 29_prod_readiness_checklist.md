# Production Readiness Checklist

## Product
- [ ] PRD approved
- [ ] personalization rules approved
- [ ] trust/safety rules approved
- [ ] onboarding and profile flows approved

## Architecture
- [ ] service boundaries reviewed
- [ ] queue topology reviewed
- [ ] idempotency strategy documented
- [ ] failure modes documented
- [ ] model routing policy approved

## Infra
- [ ] prod/staging environments provisioned
- [ ] secrets manager configured
- [ ] backups tested
- [ ] disaster recovery runbook documented
- [ ] CDN/object storage configured

## Security
- [ ] threat model reviewed
- [ ] OAuth/OIDC flows tested
- [ ] session rotation implemented
- [ ] rate limits enforced
- [ ] audit logs active
- [ ] admin access RBAC active

## Data
- [ ] migrations reviewed
- [ ] indexes reviewed
- [ ] retention jobs active
- [ ] deletion/export flows tested

## AI
- [ ] prompt versions pinned
- [ ] schema validation failures handled
- [ ] eval suite green
- [ ] fallback models configured
- [ ] cost and latency budgets defined

## Messaging
- [ ] websocket reconnect tested
- [ ] push/email delivery tested
- [ ] dedupe receipts working
- [ ] DLQs monitored

## Quality
- [ ] unit/integration/e2e suites green
- [ ] load tests passed
- [ ] moderation scenarios tested
- [ ] incident alerts wired

## Launch
- [ ] feature flags configured
- [ ] canary rollout plan approved
- [ ] support playbooks ready
- [ ] on-call owner assigned
