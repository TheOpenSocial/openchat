# 18 — Testing, Quality, and Release Gates

## Test pyramid
- unit tests for domain logic
- integration tests for modules + DB
- contract tests for API and websocket payloads
- e2e tests for core user flows
- load tests for routing and chat
- security tests for auth/session/access control
- AI eval tests for parsing/safety regression

## Critical flows to cover
- Google login
- profile creation/update
- avatar upload processing
- intent submission
- request fanout
- request acceptance
- connection creation
- message send/receipt
- block/report
- moderation action

## Queue testing
- job idempotency
- retry behavior
- dead-letter behavior
- delayed jobs
- parent-child workflows

## Realtime testing
- auth handshake
- reconnect replay
- duplicate send
- out-of-order event handling
- multi-instance gateway behavior

## AI release gates
No prompt/model/schema change ships without:
- eval pass thresholds
- fixture regression run
- sampled human review when policy-sensitive

## Performance tests
- intent creation throughput
- candidate ranking latency
- websocket concurrency
- DB query plans under load

## Release gating
Required before production deploy:
- migrations validated
- smoke tests green
- canary metrics healthy
- no Sev1/Sec1 open issues
