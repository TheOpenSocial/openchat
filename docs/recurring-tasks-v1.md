# Recurring Tasks and Scheduled Searches v1

## Goal

Add a first-class recurring automation layer so users can ask OpenSocial to:
- rerun a search on a schedule
- receive recurring discovery summaries
- schedule recurring agent briefings and reminders
- turn passive social intent into durable background coordination

This is the v1 bridge from the current intent-driven product into a ChatGPT-class social assistant surface.

## Product Scope

### Included in v1

- recurring discovery runs
- saved search subscriptions
- recurring digests and briefings
- recurring reminders with social context
- admin visibility into scheduled jobs
- user controls to pause, resume, edit, and delete schedules

### Explicitly out of scope for v1

- arbitrary code-like automations
- unlimited cron syntax exposed to users
- cross-user shared automations
- recurring circles/community lifecycle
- fully autonomous risky actions such as forced invites or connection creation without approval

## Core User Stories

- "Every weekday at 6 PM, look for tennis players near me."
- "Every Friday morning, summarize startup people I should reconnect with."
- "Every evening, give me a short social opportunities digest."
- "If there are new high-quality football chats tonight, notify me."
- "Every Saturday afternoon, check for small groups forming nearby."

## v1 Automation Types

### 1. Saved Search Subscription

Runs a structured discovery or retrieval query on a schedule and returns results if threshold conditions are met.

Examples:
- nearby tennis tonight
- startup conversations this week
- chill gaming groups after work

### 2. Discovery Briefing

Generates a compact agent-style summary using existing discovery signals.

Examples:
- tonight's best social options
- who you should reconnect with
- groups likely to form soon

### 3. Reminder and Nudge

A scheduled reminder that uses user context.

Examples:
- check in with dormant chats
- revisit unanswered intent
- prompt user to open passive mode before peak hours

## Data Model

### New tables

#### `scheduled_tasks`

Purpose:
- canonical user-owned automation definition

Suggested fields:
- `id`
- `user_id`
- `title`
- `description`
- `task_type`
- `status` (`active`, `paused`, `disabled`, `archived`)
- `schedule_type` (`hourly`, `weekly`)
- `schedule_config` (`Json`)
- `task_config` (`Json`)
- `last_run_at`
- `next_run_at`
- `last_success_at`
- `last_failure_at`
- `last_failure_reason`
- `created_at`
- `updated_at`

Indexes:
- `(user_id, status)`
- `(status, next_run_at)`

#### `scheduled_task_runs`

Purpose:
- immutable execution history and auditability

Suggested fields:
- `id`
- `scheduled_task_id`
- `user_id`
- `status` (`queued`, `running`, `succeeded`, `skipped`, `failed`)
- `triggered_at`
- `started_at`
- `finished_at`
- `trace_id`
- `result_summary`
- `result_payload` (`Json`)
- `skip_reason`
- `failure_reason`
- `created_notification_id`
- `created_agent_message_id`

Indexes:
- `(scheduled_task_id, triggered_at desc)`
- `(user_id, triggered_at desc)`

#### `saved_searches`

Purpose:
- normalized structured search definitions that can be reused by one or more scheduled tasks

Suggested fields:
- `id`
- `user_id`
- `title`
- `search_type` (`discovery_people`, `discovery_groups`, `reconnects`, `topic_search`, `activity_search`)
- `query_config` (`Json`)
- `created_at`
- `updated_at`

Indexes:
- `(user_id, search_type)`

### Prisma shape guidance

Prefer:
- `ScheduledTask`
- `ScheduledTaskRun`
- `SavedSearch`

Keep `task_config` and `schedule_config` as JSON in v1 to avoid over-modeling too early.

## API Surface

### User routes

#### `GET /api/scheduled-tasks/:userId`

Returns the user's tasks with compact schedule state:
- title
- type
- status
- next run
- last run summary

#### `POST /api/scheduled-tasks/:userId`

Creates a scheduled task.

Body v1:
- `title`
- `taskType`
- `schedule`
- `taskConfig`

#### `PUT /api/scheduled-tasks/:taskId`

Edits title, schedule, or task config.

#### `POST /api/scheduled-tasks/:taskId/pause`

Pauses the schedule.

#### `POST /api/scheduled-tasks/:taskId/resume`

Resumes and recomputes `nextRunAt`.

#### `POST /api/scheduled-tasks/:taskId/run-now`

Queues an immediate run with rate limits and idempotency protection.

#### `DELETE /api/scheduled-tasks/:taskId`

Archives the task.

#### `GET /api/scheduled-tasks/:taskId/runs`

Returns recent run history.

### Saved search routes

#### `GET /api/saved-searches/:userId`
#### `POST /api/saved-searches/:userId`
#### `PUT /api/saved-searches/:searchId`
#### `DELETE /api/saved-searches/:searchId`

### Admin routes

#### `GET /api/admin/scheduled-tasks`

Filters:
- status
- task type
- user id
- next run window

#### `GET /api/admin/scheduled-tasks/:taskId/runs`

For debugging and support.

## Contract Design

### `taskType`

Start with:
- `saved_search`
- `discovery_briefing`
- `reconnect_briefing`
- `social_reminder`

### `schedule`

Keep UI-safe and intentionally constrained.

v1 allowed shapes:
- hourly interval
- weekly day/hour/minute

Example:
```json
{
  "kind": "weekly",
  "days": ["mon", "wed", "fri"],
  "hour": 18,
  "minute": 0,
  "timezone": "America/New_York"
}
```

### `taskConfig`

#### `saved_search`
```json
{
  "savedSearchId": "uuid",
  "deliveryMode": "agent_thread",
  "minResults": 1,
  "maxResults": 5
}
```

#### `discovery_briefing`
```json
{
  "briefingType": "tonight",
  "deliveryMode": "notification_and_agent_thread",
  "maxResults": 5
}
```

#### `reconnect_briefing`
```json
{
  "deliveryMode": "agent_thread",
  "lookbackDays": 30,
  "minConfidence": 0.6
}
```

#### `social_reminder`
```json
{
  "template": "open_passive_mode",
  "deliveryMode": "notification",
  "context": {
    "targetWindow": "evening"
  }
}
```

## Execution Architecture

### New queue

Add:
- `scheduled-tasks`

Job types:
- `ScheduledTaskDispatch`
- `ScheduledTaskRun`

### Dispatch flow

1. dispatcher scans active tasks where `next_run_at <= now`
2. creates `scheduled_task_runs`
3. enqueues `ScheduledTaskRun`
4. advances `next_run_at`

### Run flow

1. load task and validate ownership/status
2. apply launch control and user preference checks
3. execute based on `taskType`
4. decide whether result should be skipped, delivered, or recorded only
5. persist run result
6. emit notification and/or write workflow message into agent thread

### Execution mapping

#### `saved_search`
- use discovery service or future search service
- return ranked items
- skip if below `minResults`

#### `discovery_briefing`
- use existing discovery services:
  - `suggestTonight`
  - `getPassiveDiscovery`
  - `getInboxSuggestions`
  - `publishAgentRecommendations` logic as formatting inspiration

#### `reconnect_briefing`
- use analytics + discovery reconnect signals

#### `social_reminder`
- use notification templates plus optional agent-thread write

## Delivery Model

### Delivery modes

- `notification`
- `agent_thread`
- `notification_and_agent_thread`

### Rules

- respect user quiet hours and notification mode
- respect passive/discovery opt-in controls
- never create connection or outreach automatically in v1
- only suggest, summarize, or notify

## Safety and Approval Rules

v1 scheduled tasks must be low-risk by design.

Allowed:
- read/search/recommend/summarize/notify

Not allowed:
- auto invite users
- auto create chats
- override moderation or trust gates
- perform high-risk actions while unattended

Any future automation that creates outbound social actions should require:
- explicit user approval mode
- per-task autonomy rules
- admin visibility
- audit log entries

## Launch Controls

Add launch flags:
- `scheduled_tasks`
- `saved_searches`
- `recurring_briefings`

These should support:
- global disable
- cohort enablement
- user-level allowlist for early rollout

## Personalization and Memory Integration

Scheduled tasks should use:
- `timezone`
- `locale`
- `notificationMode`
- `memoryMode`
- discovery eligibility
- trust and modality rules

Saved searches and recurring briefings should be able to reference:
- topics
- activities
- modality
- timing windows
- trust filters
- group vs 1:1 preference

## Agent Integration

The agent layer should be the user-facing narrative surface for recurring tasks.

Examples:
- write a workflow message: "I checked tonight's opportunities and found two strong matches."
- publish reconnect suggestions into the latest thread
- summarize why nothing was sent

This keeps scheduled behavior aligned with the rest of the product.

## Observability and Admin

Track:
- task count by status and type
- run success rate
- run skip rate
- run latency
- notification delivery from scheduled runs
- agent-thread delivery from scheduled runs

Admin should be able to:
- inspect task config
- inspect run history
- replay a failed run
- pause a problematic task

## Suggested Implementation Order

### Phase 1

- schema
- shared types
- CRUD API for scheduled tasks
- `run-now`
- queue and worker skeleton

### Phase 2

- dispatcher
- `saved_search`
- `discovery_briefing`
- run history
- admin inspection

### Phase 3

- `reconnect_briefing`
- richer delivery controls
- launch-control rollout
- client surfaces

## Mapping to Current Gaps

This spec primarily closes:
- `U-18` User-defined recurring tasks and scheduled automations
- `U-19` Saved searches and scheduled discovery runs
- `U-20` Topic- or goal-specific recurring digests and agent briefings
- `UQ-05` Recurring tasks + scheduled searches v1

## Recommended First Build Slice

If we want the fastest valuable slice, build this first:

1. `saved_search`
2. `discovery_briefing`
3. `run-now`
4. weekly schedule only
5. delivery to agent thread and notification

That gets us user-visible recurring intelligence without opening risky autonomy too early.
