# 20 — Admin Ops, Support, and Feature Flags

## Admin surfaces
### Moderation console
- view reports
- inspect evidence
- apply actions
- audit trail

### Support console
- view user state
- resend notifications if allowed
- inspect routing/job history
- no direct message body access unless policy permits and is audited

### Operations console
- queue health
- worker health
- failed jobs
- replay tools
- feature flag states

## Feature flags
Use feature flags for:
- new parser versions
- new ranking weights
- new request fanout rules
- group intents
- new onboarding steps
- experimental UI

## Rollout policy
- internal
- alpha cohort
- beta cohort
- city/activity niches
- general release

## Support workflows
- auth issue
- avatar/media issue
- no matches issue
- abusive user issue
- appeal path

## Admin security
- RBAC
- least privilege
- SSO if possible for internal staff
- audit every sensitive action
