# 15 — Observability, SLOs, and Incident Response

## Telemetry standard
Use OpenTelemetry for traces and metrics, with structured logs correlated by request/trace/job ids.

## Must-have telemetry
### Traces
- API requests
- model calls
- BullMQ jobs
- DB queries (sampled appropriately)
- WebSocket event handling

### Metrics
- API latency
- intent routing latency
- queue depth
- job failure rate
- request acceptance rate
- message delivery latency
- model error rate
- model cost per route
- moderation queue backlog

### Logs
- structured JSON
- correlation ids
- actor/entity ids
- redaction of secrets and sensitive content

## SLOs
### Suggested initial SLOs
- p95 POST /intents < target under normal load
- p95 time-to-request-fanout < target
- p95 chat send ack < target
- error budget for routing pipeline
- queue backlog thresholds

## Alerting
Page on:
- sustained API 5xx spikes
- worker crash loops
- dead-letter growth
- Redis unavailable
- DB replication/latency issue
- moderation backlog breach
- excessive model schema failures

## Runbooks
Create runbooks for:
- queue stuck / backlog
- failed migrations
- model provider degradation
- broken Google auth callback
- websocket outage
- notification outage
- abusive traffic event

## Incident process
- detect
- declare
- assign incident lead
- mitigate
- communicate internally
- resolve
- write postmortem with actions
