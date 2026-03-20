# 14 — Infrastructure, Environments, and Delivery

## Environments
- local
- development
- staging
- production

## Core infrastructure
- API app deployment
- worker deployment
- realtime gateway deployment
- PostgreSQL managed cluster
- Redis managed cluster
- object storage
- CDN
- secrets manager
- observability stack
- email/push providers as needed

## Environment rules
### local
- docker-compose acceptable
- fake push/email
- local object storage emulator optional

### staging
- production-like topology
- isolated data
- synthetic test users
- feature flags enabled
- load-test capable

### production
- managed DB with PITR backups
- Redis with persistence appropriate to queue guarantees
- autoscaling for API/gateway/worker
- multi-AZ where budget allows
- WAF / CDN edge in front of public app

## Deployment model
- CI builds immutable artifacts
- deploy via blue/green or rolling with health checks
- separate worker rollout from API rollout where needed
- migration step gated and explicit

## Secrets
- no secrets in repo
- environment-specific secret scopes
- rotation procedures
- short-lived cloud credentials where possible

## Backups
- Postgres daily backups + PITR
- object storage versioning if possible
- backup restore drills on schedule

## Config management
- typed config
- startup validation
- env parity where possible
- safe defaults
