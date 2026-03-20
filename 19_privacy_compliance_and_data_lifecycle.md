# 19 — Privacy, Compliance, and Data Lifecycle

## Data minimization
Collect only what materially improves routing, trust, and product safety.

## Sensitive data
Treat:
- private messages
- reports
- moderation decisions
- precise location if ever added
- OAuth identity data
as sensitive.

## Retention policy areas
- intents
- match requests
- chats
- reports
- audit events
- embeddings
- deleted accounts
- media assets

## User controls
- edit profile
- delete account
- export core account data if required
- block and privacy settings
- revoke incoming discoverability

## Deletion model
- soft delete for immediate UX
- delayed hard delete for safety/legal windows where appropriate
- cryptographic or physical deletion policy for media and backups documented separately

## Embeddings policy
Embeddings derived from user text are user-derived data and should be treated under the same lifecycle policy as source text where applicable.

## Logging and privacy
Do not log raw tokens, OAuth secrets, or unnecessary message bodies in application logs.

## Legal docs required before launch
- privacy policy
- terms of service
- community/safety policy
- moderation and appeals policy
