# 16 — Security Threat Model

## Security posture
Align implementation and review with OWASP ASVS-style controls and session-management best practices.

## Assets to protect
- user identity
- private messages
- profile data
- trust scores
- moderation records
- OAuth tokens / sessions
- object storage assets
- internal admin actions
- AI prompts / policies / tooling boundaries

## Threat classes
### Identity / session
- session fixation
- session theft
- OAuth code interception
- CSRF
- account linking abuse

### API / app
- IDOR / broken object-level auth
- injection
- rate-limit abuse
- mass enumeration
- replay of chat sends / request accepts

### Realtime
- unauthorized socket connection
- stale auth on long-lived connections
- room subscription abuse
- event spoofing

### AI-specific
- prompt injection through user content
- policy bypass attempts
- tool misuse
- prompt leakage
- unsafe autonomous action

### Storage/media
- malicious file upload
- oversized payload abuse
- image parser vulnerabilities
- public object key guessing

### Admin / moderation
- privilege escalation
- insufficient audit trail
- unsafe bulk actions

## Security requirements
- strong authentication and authorization boundaries
- secure cookies / token handling
- CSRF protection
- object-level access checks everywhere
- signed uploads
- file type and size validation
- private-by-default storage posture where possible
- role-based admin controls
- immutable audit logs for sensitive actions

## AI security requirements
- no unrestricted tools in prod
- allowlist-only internal tools
- schema validation on all model outputs
- separate policy layer from model suggestions
- prompt version control
- red-team prompts
- runtime monitoring for drift / unusual tool patterns

## OpenClaw-inspired lesson
Autonomous agent stacks with broad tools increase attack surface. For this product, use constrained internal tools and keep business-critical writes outside the model loop.
