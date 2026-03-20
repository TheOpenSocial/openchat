# Engineering Governance

## Branch strategy
- `main` is always releasable.
- Feature branches use `codex/<topic>`.
- Merge via pull requests with CI green.

## Release notes process
- Every PR includes a short changelog line in description.
- Weekly release notes summarize user-facing changes, infra changes, and known issues.

## Environment variable policy
- Add every variable to `.env.example`.
- Never commit secrets.
- Production secrets are managed in AWS Secrets Manager.

## Error handling conventions
- API returns standardized envelope with trace ID.
- Use typed domain errors and map to HTTP status codes.
- Never leak raw stack traces to clients.

## Logging conventions
- JSON structured logs only in production.
- Include `traceId`, `userId` (if available), and module.
- Redact PII by default.

## Naming conventions
- Queue names: kebab-case (`intent-processing`).
- Event names: dot-case (`request.created`).
- Tool names: verb-noun (`parse_intent`).
