# 05 — System Architecture

## Architectural style
Modular monolith first, event-driven internally, with clean seams for selective service extraction later.

## Why modular monolith first
- faster iteration
- simpler transactional boundaries
- lower operational overhead
- better debugging during product discovery

## Core stack
- TypeScript
- NestJS
- PostgreSQL
- pgvector
- Redis
- BullMQ
- WebSockets
- Object storage + CDN
- OpenAI Responses API
- OpenAI Agents SDK
- OpenTelemetry

## High-level modules
- auth
- users
- profiles
- media
- intents
- parsing
- matching
- routing
- requests
- connections
- chat
- notifications
- safety
- moderation
- admin
- ai-orchestration
- jobs
- analytics

## Runtime topology
### API app
NestJS HTTP API:
- auth endpoints
- profile endpoints
- intent endpoints
- moderation/admin endpoints

### Realtime gateway
NestJS WebSocket gateways:
- presence
- request updates
- chat delivery
- typing / read receipts

### Worker processes
Dedicated BullMQ workers:
- parse-intent-worker
- candidate-retrieval-worker
- ranking-worker
- request-fanout-worker
- notification-worker
- safety-worker
- cleanup-worker
- analytics-worker
- media-processing-worker

### Data stores
- PostgreSQL for source-of-truth relational state
- pgvector for embedding similarity inside Postgres
- Redis for cache, queues, transient presence, rate limits
- Object storage for profile images and media derivatives

## Data flow
1. user submits intent
2. API writes intent row + outbox event
3. BullMQ pipeline processes parse -> retrieve -> rank -> fanout
4. candidate requests are created transactionally
5. recipients receive realtime + push notifications
6. acceptance creates connection
7. chat moves through realtime layer with durable persistence
8. feedback updates trust and analytics

## Key patterns
- transactional outbox for reliable event publication
- idempotent job handlers
- append-only audit trails for critical state transitions
- deterministic DB writes around AI-generated suggestions
- optimistic UX over durable backend state
