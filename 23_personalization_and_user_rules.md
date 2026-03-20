# Personalization & User Rules

## Goal

Make OpenSocial feel like **the user's social operating system**, not a generic matching engine.

Personalization controls:
- who a user can be matched with
- when and how the system can reach them
- how proactive the agent layer can be
- what the ranking engine should prioritize
- how much the system can learn and remember
- which notifications, suggestions, and digests are allowed

This is a core platform subsystem, not a settings page.

---

## Principles

1. **User control first**
   - hard user rules always override learned preferences and ranking heuristics

2. **Safe by default**
   - strict defaults for offline meetups, minors, location sharing, and unsolicited contact

3. **Explainable**
   - the app should be able to answer:
     - "Why did I get this request?"
     - "Why was this person ranked highly?"
     - "Why didn't I get shown?"

4. **Intent-specific**
   - users may want different behavior for:
     - chat
     - gaming
     - sports
     - group formation
     - offline activities

5. **Progressive**
   - start with a small set of rules during onboarding
   - unlock advanced controls later

---

## Personalization Layers

### 1. Hard Safety Rules
System-enforced rules that cannot be overridden by the user.
Examples:
- no matching minors with adults
- no direct offline requests without policy-compliant trust gates
- no contacts from blocked users
- moderation quarantines always win

### 2. User Hard Rules
Explicit user rules.
Examples:
- verified users only
- no offline invites
- only English and Spanish
- no requests after 10 PM local time

### 3. Product Policy Rules
Platform defaults and policy gates.
Examples:
- max active pending requests
- max request fanout per intent
- reputation threshold for outreach

### 4. Intent-Type Rules
Per-mode configuration.
Examples:
- auto-send is allowed for gaming but not for offline sports
- nearby-only for table tennis but not for startup chats

### 5. Learned Preferences
Behavior-derived signals.
Examples:
- user tends to accept group size 3–4
- user prefers same-language chat
- user rejects late-night requests

### 6. Exploration Logic
Controlled novelty.
Examples:
- 10–15% of candidates can be adjacent-interest matches
- can be disabled by conservative users

---

## User Rule Categories

## A. Reachability Rules
Controls when and how the user can receive requests.

Examples:
- only receive requests after work hours
- do not receive requests on weekdays
- receive real-time requests only for selected topics
- allow same-day plans, not immediate plans
- accept requests from existing connections anytime, new users only during selected windows

Fields:
- quiet_hours_start
- quiet_hours_end
- allowed_days_of_week
- real_time_topics[]
- allow_same_day
- allow_immediate
- existing_connections_priority

---

## B. Matching Rules
Controls candidate filtering and ranking.

Examples:
- nearby only for offline intents
- profile picture required
- verified users only
- avoid users previously declined
- prefer users with shared interests
- require a minimum trust score

Fields:
- min_trust_score
- require_profile_photo
- require_verified_email
- require_verified_identity_for_offline
- max_distance_km
- exclude_recently_declined_days
- exclude_recent_conversations_days
- preferred_languages[]
- preferred_shared_interest_overlap_min

---

## C. Social Style Rules
Controls the kind of people and interactions the user prefers.

Examples:
- prefer chill people
- prefer thoughtful conversations
- prefer 1:1 over groups
- prefer spontaneous plans
- avoid hyper-competitive players

Fields:
- preferred_social_energy: chill | balanced | high
- preferred_group_size_min
- preferred_group_size_max
- prefer_one_to_one
- prefer_small_groups
- spontaneity_level: immediate | same_day | planned
- competitiveness_tolerance: low | medium | high

---

## D. Agent Autonomy Rules
Controls how much initiative the system can take.

Examples:
- ask before sending any requests
- auto-send up to 3 requests for gaming
- never create a group without approval
- allow proactive digests
- do not revive old contacts automatically

Fields:
- require_approval_before_send
- auto_send_rules[]
- max_auto_sent_requests_per_intent
- allow_group_formation_without_approval
- allow_proactive_suggestions
- allow_dormant_connection_revival
- allow_agent_retries_for_unanswered_requests

---

## E. Notification Rules
Controls interruption and notification channels.

Examples:
- push only on accepted matches
- digest-only for new opportunities
- email summary once daily
- silent overnight

Fields:
- push_on_request_received
- push_on_request_accepted
- push_on_group_ready
- digest_frequency: off | daily | twice_daily | weekly
- notification_channels[]
- silent_hours_start
- silent_hours_end

---

## F. Memory & Learning Rules
Controls what the system remembers and learns.

Examples:
- remember who I liked
- do not store chat content for personalization
- learn from accept/reject behavior
- let me reset my social profile

Fields:
- allow_behavior_learning
- allow_chat_content_personalization
- allow_feedback_based_learning
- memory_scope: minimal | standard | enhanced
- can_reset_recommendation_profile

---

## G. Safety & Boundary Rules
Controls safety posture per user.

Examples:
- text chat first only
- no location sharing until both sides opt in
- no offline meetups with unverified accounts
- no group invites from strangers

Fields:
- text_chat_first_only
- require_mutual_opt_in_for_location_share
- require_identity_verification_for_offline
- allow_group_invites_from_non_connections
- block_uncivil_or_low_reputation_users
- hidden_profile_until_request_acceptance

---

## Intent-Specific Overrides

Users need:
- global defaults
- per-intent-type overrides
- optional per-topic overrides

Example:
- global: ask before sending any request
- gaming override: auto-send up to 3 requests
- offline sports override: verified + nearby only
- startup discussion override: allow adjacent-interest exploration

Suggested structure:
```ts
type UserRuleSet = {
  global: RuleConfig;
  intentOverrides: Partial<Record<IntentType, RuleConfig>>;
  topicOverrides: Partial<Record<string, RuleConfig>>;
}
```

---

## Onboarding Strategy

### Minimum Onboarding
Ask only the highest-signal questions:
- what do you want to use OpenSocial for?
- what kinds of people/activities interest you?
- when are you usually available?
- do you prefer 1:1 or groups?
- how proactive should the system be?
- do you want real-time suggestions or digests?

### Advanced Settings Later
Expose full controls in:
- Settings > Privacy & Safety
- Settings > Reachability
- Settings > Recommendations
- Settings > Notifications
- Settings > Agent Controls

---

## Ranking Integration

Ranking must consume user rules before semantic scoring.

Order:
1. hard safety filters
2. hard user filters
3. policy filters
4. per-intent overrides
5. eligibility score
6. semantic similarity
7. behavioral preference ranking
8. exploration boost

Pseudo:
```ts
candidate_score =
  semantic_similarity * w1 +
  availability_match * w2 +
  trust_score * w3 +
  shared_interest_overlap * w4 +
  learned_preference_score * w5 +
  exploration_bonus * w6
```

Candidates failing hard rules are dropped before scoring.

---

## Agent Behavior Integration

Agent orchestration must consult the rule engine before:
- creating outreach jobs
- scheduling retries
- composing digests
- proposing groups
- reviving dormant ties
- sending reminders

The rule engine must be callable as a synchronous domain service and as an async policy check in queues.

---

## Data Model

Recommended tables:
- user_personalization_profiles
- user_rule_sets
- user_intent_type_rules
- user_topic_rules
- user_learning_profiles
- personalization_audit_events

Example fields:
- user_id
- version
- rule_json
- last_updated_by
- source: user | system_default | migration | admin
- updated_at

---

## Admin & Debugging

Support should be able to inspect:
- active rules
- why a match was or was not sent
- which rule blocked a request
- what the ranking breakdown was

This requires:
- policy evaluation logs
- ranking explanation payloads
- redacted debug views

---

## Analytics

Track:
- rule adoption rate
- % of intents affected by hard rules
- auto-send conversion vs manual approval conversion
- notification opt-out rates
- personalization reset frequency
- acceptance rate by rule profile

---

## Security & Privacy

- never expose private rules to other users
- location rules must use coarse-grained location for matching
- store sensitive preference controls separately from public profile
- allow full export and deletion of personalization data

---

## Rollout

Phase 1:
- basic availability
- 1:1 vs group preference
- quiet hours
- verified-only toggle
- push preferences

Phase 2:
- intent-type overrides
- agent autonomy controls
- learning controls

Phase 3:
- topic overrides
- exploration tuning
- explanation UI
- profile reset tools
