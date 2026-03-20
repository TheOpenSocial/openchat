# Analytics, Experimentation & Growth

## Goal

Instrument the product around **successful social outcomes**, not vanity metrics.

---

## North Star

Successful connection outcomes per active user.

This can include:
- accepted requests
- chats started
- messages exchanged threshold crossed
- repeat interactions
- group formation success
- offline plan intent completion (future)

---

## Event Taxonomy

### Acquisition
- signup_started
- signup_completed
- oauth_connected
- profile_completed

### Core Product
- intent_created
- intent_parsed
- candidates_ranked
- requests_sent
- request_received
- request_accepted
- request_rejected
- connection_created
- first_message_sent
- conversation_threshold_reached

### Personalization
- rule_created
- rule_updated
- digest_opt_in_changed
- agent_autonomy_changed

### Safety
- block_created
- report_submitted
- moderation_action_applied

---

## Experimentation

Use feature flags and experiment assignments for:
- candidate count
- explanation style
- request copy
- auto-send defaults
- ranking weights
- digest frequency

Do not experiment on:
- core safety constraints
- age/location policy
- trust score minimums without explicit review

---

## Dashboards

- activation funnel
- time to first connection
- acceptance rate by intent type
- retention by successful connection count
- notification conversion
- false positive / poor match feedback

---

## Data Governance

- separate product analytics from operational logs
- minimize PII in event streams
- version event schemas
- support deletion and user export workflows
