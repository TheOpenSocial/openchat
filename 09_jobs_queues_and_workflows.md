# 09 — Jobs, Queues, and Workflows

## Why BullMQ
Use BullMQ for durable asynchronous application workflows:
- retries
- delayed jobs
- fanout
- parent-child flows
- dead-letter handling
- operational visibility

## Queue inventory
- intent.parse
- intent.embed
- intent.route
- candidate.rank
- request.fanout
- request.expire
- connection.create
- notification.push
- notification.email
- safety.scan
- trust.recompute
- asset.process
- analytics.aggregate
- cleanup.retention

## Workflow: intent routing
1. `intent.created`
2. enqueue `intent.parse`
3. enqueue `intent.embed`
4. enqueue `candidate.rank`
5. enqueue `request.fanout`
6. delayed `request.expire`
7. if accepted -> enqueue `connection.create`

## Parent-child flow usage
For complex workflows like group formation:
- parent job: route group intent
- child jobs: score candidates, send wave, watch quorum, create group

## Idempotency
Every job must be idempotent using:
- job keys
- dedupe keys
- DB state guards
- exactly-once not assumed; effectively-once behavior required

## Retry policy
- transient infra errors: exponential backoff
- model timeouts: bounded retry
- schema validation failures: limited retry then dead-letter
- policy denials: do not retry

## Dead-letter handling
Every critical queue needs:
- DLQ
- replay tooling
- root-cause tagging
- alerting thresholds

## Scheduling
Use delayed jobs for:
- request expiry
- second-wave routing
- stale connection cleanup
- digest notifications
- retention tasks

## Worker isolation
Separate pools for:
- latency-sensitive jobs
- expensive model jobs
- low-priority maintenance jobs
