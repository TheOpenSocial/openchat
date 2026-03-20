# 22 — Repo Structure and Coding Standards

## Proposed repo layout
/apps
  /api
  /worker
  /gateway
/packages
  /config
  /db
  /events
  /contracts
  /ai
  /observability
  /shared
/docs

## NestJS module boundaries
- auth
- users
- profiles
- intents
- routing
- requests
- connections
- chat
- moderation
- admin
- notifications
- analytics

## Coding standards
- strict TypeScript
- no `any` in core paths
- DTO/schema validation everywhere
- repository/service boundaries clear
- domain events explicit
- idempotent job handlers
- feature flags around behavior changes
- high-value comments only
- no prompt strings scattered through code

## Config standards
- env schema validated at startup
- explicit defaults
- no process.env reads in random modules

## AI standards
- prompts versioned
- schemas shared as code
- every model call traced
- output validation mandatory
- model choice explicit and configurable

## Database standards
- migrations only
- no schema drift
- every query path reviewed for indexes on hot paths

## Security standards
- authz check at every object boundary
- no admin bypasses without audit
- redaction utilities for logs
