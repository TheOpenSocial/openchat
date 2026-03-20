# 21 — Implementation Plan

## Phase 0 — Foundations
- repo bootstrap
- CI/CD
- typed config
- auth skeleton
- DB + migrations
- Redis + BullMQ
- observability scaffold
- feature flags scaffold
- object storage integration

## Phase 1 — Core product slice
- Google login
- profile creation and avatar upload
- interest/activity model
- intent submission endpoint
- intent parser
- candidate retrieval + ranking v1
- request creation + recipient inbox
- accept/decline flow
- connection creation
- realtime chat
- block/report

## Phase 2 — Safety + durability
- trust score pipeline
- moderation console
- worker DLQs
- rate limiting
- request expiry
- delayed second-wave routing
- admin ops tools

## Phase 3 — Product polish
- richer availability
- better candidate explanations
- profile tuning
- conversation feedback
- ranking improvements
- better notifications

## Phase 4 — Scale and intelligence
- group intents
- advanced routing policy agent
- proactive suggestions
- cohort experiments
- performance optimization
