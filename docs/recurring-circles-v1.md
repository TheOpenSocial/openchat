# Recurring Circles v1

This spec defines the first production slice for recurring communities/circles in OpenSocial.

## Goal

Support repeatable small communities with:
- an owner-managed circle definition
- membership management
- recurring session cadence
- session opening for active circles
- notification fanout to active members
- admin visibility

## Data model

- `recurring_circles`
  - owner, title/description, visibility, topic tags, target size
  - cadence (`weekly` + days/hour/minute/timezone/intervalWeeks)
  - lifecycle (`active|paused|archived`)
  - schedule pointers (`last_session_at`, `next_session_at`)
- `recurring_circle_members`
  - role (`owner|admin|member`)
  - membership lifecycle (`active|invited|left|removed`)
- `recurring_circle_sessions`
  - scheduled/opened sessions for each circle
  - optional generated intent linkage for future orchestration

## API surface

User-scoped:
- `GET /api/recurring-circles/:userId`
- `POST /api/recurring-circles/:userId`
- `PUT /api/recurring-circles/:circleId`
- `DELETE /api/recurring-circles/:circleId`
- `POST /api/recurring-circles/:circleId/pause`
- `POST /api/recurring-circles/:circleId/resume`
- `GET /api/recurring-circles/:circleId/members`
- `POST /api/recurring-circles/:circleId/members`
- `DELETE /api/recurring-circles/:circleId/members/:memberUserId`
- `GET /api/recurring-circles/:circleId/sessions`
- `POST /api/recurring-circles/:circleId/sessions/run-now`

Admin visibility:
- `GET /api/admin/recurring-circles`
- `GET /api/admin/recurring-circles/:circleId/sessions`
- `POST /api/admin/recurring-circles/dispatch-due`

## Launch control

- New launch action: `recurring_circles`
- New control key: `launch.enable_recurring_circles`
- Env default: `FEATURE_ENABLE_RECURRING_CIRCLES=false`

## Rollout plan

1. Backend-only alpha (current)
- launch-gated APIs and scheduler dispatch
- owner + admin operational visibility

2. Internal dogfood
- admin-driven due-session dispatch in staging
- validate cadence quality, notification noise, and membership workflows

3. User-facing beta
- web/mobile surface for create/manage circles
- lightweight session cards + join/rejoin actions

4. Orchestration upgrade
- optional auto-intent generation per session
- agent summary + continuity memory linkage
- moderation hooks for circle-level safety policies
