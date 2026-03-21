# OpenSocial Use Cases

This document is the product-level map of what OpenSocial should support.

OpenSocial is a social operating system for intent-driven connection:
- users express what they want to do, talk about, or explore
- the system understands intent, applies rules and memory, and finds relevant people
- the agent layer coordinates the interaction without replacing the humans

This file is intentionally broader than current implementation status.
It defines the full conceptual surface we want the product to support over time.

## Product Pillars

- Intent to connection
- Discovery without noisy feeds
- Memory with explicit user control
- Agent-assisted coordination
- Trust, safety, and explainability
- Durable social continuity

## Master Use-Case Families

### 1. Real-Time Intent

User wants something now and expects fast coordination.

Use cases:
- Real-time conversation: "I want to talk about the match right now."
- Real-time gaming: "Who wants to play Valorant now?"
- Real-time small-group formation: "Need 3 people for a quick lobby."
- Live co-working or study: "Anyone free to co-work for the next hour?"
- Live emotional support or company: "I just want someone to talk to right now."

Success looks like:
- intent captured quickly
- relevant people identified fast
- at least one meaningful acceptance
- chat or group created with minimal friction

### 2. Same-Day Planning

User wants something later today, not necessarily immediately.

Use cases:
- "Anyone to play tennis after 7?"
- "Want to discuss startups this evening?"
- "Looking for people to watch the game tonight."
- "Would love to join a group dinner later."

Success looks like:
- time constraints captured correctly
- user gets matches or alternatives before the window expires
- fallback suggestions appear when density is low

### 3. Offline Coordination

User wants in-person activity with extra trust and safety controls.

Use cases:
- sports partners
- local hangouts
- nearby events
- small in-person groups
- co-working nearby

Success looks like:
- coarse location and timing constraints respected
- trust gates applied
- unsafe or low-confidence matches filtered out

### 4. Group Formation

The system coordinates more than one recipient and manages threshold logic.

Use cases:
- "Need 4 people for poker tonight."
- "Looking for a chill 3-person squad."
- "Want to form a small study group."
- "Need a few founders to brainstorm with."

Success looks like:
- multi-match orchestration
- partial-group handling
- backfill if people drop
- chat opens only when threshold is reached

### 5. Passive Availability

User is open to being discovered without creating a fresh intent each time.

Use cases:
- "Open to startup chats tonight."
- "Available for gaming after work."
- "Prefer 1:1 conversations this week."
- "Open to new people, but only verified users."

Success looks like:
- user can be surfaced for relevant incoming opportunities
- passive mode respects explicit rules, timing, and safety

### 6. Discovery and Exploration

User does not know exactly what they want and needs suggestions.

Use cases:
- "What can I do tonight?"
- topic exploration
- activity exploration
- user discovery
- nearby opportunities
- small-group opportunities

Success looks like:
- sparse, high-signal recommendations
- no infinite-scroll feed behavior
- suggestions feel useful, not spammy

### 7. Relationship Continuity

The system should help successful connections become durable.

Use cases:
- reconnect with a good prior match
- suggest repeat activities
- revive dormant but high-quality conversations
- suggest continuity after a successful chat or group

Success looks like:
- strong prior interactions are remembered
- reconnect prompts feel timely and welcome

### 8. Multi-Intent Users

A user may want several things at once.

Use cases:
- "I want to play and also talk about crypto."
- multiple same-day opportunities in parallel
- one urgent and one passive need at the same time

Success looks like:
- system splits or manages multiple intents cleanly
- user is not overwhelmed by too much fanout or too many notifications

### 9. No-Match, Delay, and Recovery

The system should degrade gracefully when matching is weak.

Use cases:
- no users available
- not enough users for a group
- low-confidence candidates only
- delayed second-wave outreach
- widened filters after timeout
- alternative suggestions instead of dead ends

Success looks like:
- user always knows what is happening
- retries and widening are safe and explainable

### 10. Agent-Assisted Coordination

The agent is not just chat; it is the orchestration layer.

Use cases:
- capture and clarify intent
- split a broad message into multiple possible goals
- explain why a candidate was selected
- explain why no one was found
- summarize progress while queues are still running
- suggest next actions or alternative routes
- publish discovery into the user's thread

Success looks like:
- the agent feels helpful and context-aware
- the agent does not take unsafe actions without policy and approval

### 11. Memory and Personalization

The system should remember enough to improve results, while staying controllable.

Use cases:
- explicit rules
- learned social preferences
- memory of successful interactions
- retrieval summaries for profile and interaction history
- life graph of interests, styles, schedules, and affinities
- memory reset and scope control

Success looks like:
- personalization improves ranking and discovery
- user boundaries always override learned behavior
- memory is explainable and resettable

### 12. Search

Search is a secondary but important support layer.

Use cases:
- topic search
- activity search
- user lookup by handle, name, or shared interests
- future group search
- recurring cluster search later

Success looks like:
- search supports intent and discovery, rather than replacing them

### 13. Notifications and Re-Engagement

The system should deliver meaningful updates without becoming annoying.

Use cases:
- request received
- request accepted
- group ready
- reminder to respond
- digest summaries
- dormant connection revival suggestions
- topic or opportunity digests

Success looks like:
- inbox first
- realtime when user is present
- push when interruption is justified
- digest when low urgency or user preference requires it

### 14. Safety, Trust, and Moderation

The system must preserve user trust as a first-class outcome.

Use cases:
- block and report
- content moderation before send
- review and escalation queues
- offline trust gating
- suspicious behavior detection
- user-specific safety boundaries

Success looks like:
- risky interactions are prevented or contained
- moderation is durable and auditable

### 15. Admin and Support Operations

Operators need to understand, debug, and repair the system.

Use cases:
- inspect profiles, intents, chats, and sessions
- inspect routing explanations
- inspect memory and life graph
- inspect agent traces
- triage moderation flags
- replay stuck jobs
- repair broken workflows

Success looks like:
- support can resolve issues without DB spelunking

### 16. Scheduled and Recurring Intelligence

This is the biggest gap relative to a ChatGPT-class assistant surface.

Use cases:
- saved searches that rerun automatically
- scheduled discovery checks
- recurring digests by topic or activity
- user-defined agent tasks
- reminders with social context
- "every weekday at 6, look for tennis players nearby"
- "every Friday morning, summarize startup conversations I should continue"

Success looks like:
- users can create recurring automations safely
- scheduled jobs respect user rules, quiet hours, trust, and opt-in controls

## Capability Tiers

### Tier A: MVP-Critical

- real-time conversation
- real-time activity
- same-day planning
- request flow
- 1:1 chat
- group formation
- trust and moderation basics
- passive discovery
- agent-guided intent flow

### Tier B: Growth and Retention

- continuity and reconnects
- stronger memory and personalization
- richer discovery surfaces
- better explanations
- better digests and reminders

### Tier C: ChatGPT-Class Social Assistant

- multi-intent decomposition
- user-programmable recurring tasks
- scheduled searches and recurring discovery
- higher-autonomy agent workflows with approval guardrails
- deep, explainable social memory

## Current Strategic Gaps

These are conceptually important and should remain visible:

- live staging/production validation of all documented flows, not just local and mocked verification
- deployment hardening so required runtime dependencies cannot be omitted silently
- deeper end-to-end verification for recurring automation/circle flows against a real deployed environment
- richer moderation operations ergonomics: queue ownership, reviewer notes, enforcement explainability, and triage SLA visibility
- broader real-user/manual QA for continuity, memory explanations, and moderation edge cases

## Source Alignment

This document aligns with:
- [30_user_use_cases_and_behavioral_spec.md](/Users/cruciblelabs/Documents/openchat/30_user_use_cases_and_behavioral_spec.md)
- [23_personalization_and_user_rules.md](/Users/cruciblelabs/Documents/openchat/23_personalization_and_user_rules.md)
- [25_search_discovery_and_recommendations.md](/Users/cruciblelabs/Documents/openchat/25_search_discovery_and_recommendations.md)
- [24_notifications_delivery_and_digests.md](/Users/cruciblelabs/Documents/openchat/24_notifications_delivery_and_digests.md)
- [PROGRESS.md](/Users/cruciblelabs/Documents/openchat/PROGRESS.md)
