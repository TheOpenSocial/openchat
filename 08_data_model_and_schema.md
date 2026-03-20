# 08 — Data Model and Schema

## Primary entities

### users
- id (uuid)
- google_subject_id nullable unique
- email unique nullable
- email_verified_at nullable
- display_name
- username nullable unique
- avatar_asset_id nullable
- locale
- timezone
- status
- created_at
- updated_at
- deleted_at nullable

### profiles
- user_id pk/fk
- bio nullable
- city nullable
- country nullable
- visibility enum
- availability_mode enum
- discoverability_settings jsonb
- preferences jsonb
- onboarding_state jsonb
- trust_score numeric
- moderation_state enum
- last_active_at nullable

### profile_interests
- id
- user_id
- kind enum(topic, activity, game, sport, community)
- label
- normalized_label
- weight numeric default 1
- source enum(user, inferred, system)
- created_at

### user_embeddings
- id
- user_id
- embedding_type enum(profile, interests, activities)
- vector vector(...)
- model
- updated_at

### intents
- id
- user_id
- raw_text
- status enum(open, routing, matched, expired, cancelled, blocked)
- parsed_intent jsonb
- confidence numeric
- safety_state enum(clean, review, blocked)
- expires_at
- created_at
- updated_at

### intent_embeddings
- id
- intent_id
- vector vector(...)
- model
- created_at

### candidate_sets
- id
- intent_id
- version int
- candidates jsonb
- created_at

### match_requests
- id
- intent_id
- sender_user_id
- recipient_user_id
- status enum(pending, accepted, declined, ignored, expired, cancelled)
- wave int
- relevance_features jsonb
- sent_at
- responded_at nullable
- expires_at

### connections
- id
- connection_type enum(dm, group)
- origin_intent_id nullable
- created_by_user_id
- status enum(active, archived, blocked, closed)
- created_at
- closed_at nullable

### connection_members
- connection_id
- user_id
- role enum(member, owner, moderator)
- joined_at
- left_at nullable

### messages
- id
- connection_id
- sender_user_id
- client_message_id
- body
- body_format enum(plain)
- created_at
- edited_at nullable
- deleted_at nullable
- moderation_state enum(clean, hidden, flagged)

### message_receipts
- message_id
- user_id
- delivered_at nullable
- read_at nullable

### reports
- id
- reporter_user_id
- target_user_id nullable
- connection_id nullable
- message_id nullable
- reason enum
- details text
- status enum(open, triaged, actioned, dismissed)
- created_at

### blocks
- blocker_user_id
- blocked_user_id
- created_at

### audit_events
- id
- actor_user_id nullable
- actor_type enum(user, system, admin)
- entity_type
- entity_id
- event_name
- payload jsonb
- created_at

### assets
- id
- owner_user_id nullable
- storage_key
- mime_type
- size_bytes
- width nullable
- height nullable
- kind enum(profile_image, attachment, derivative)
- created_at

### notifications
- id
- user_id
- type
- payload jsonb
- status
- created_at
- delivered_at nullable

## Indexing
- btree on all foreign keys and status columns
- composite on (recipient_user_id, status, sent_at desc)
- composite on (connection_id, created_at)
- gin on selected jsonb fields
- ivfflat / hnsw indexes for pgvector where supported and appropriate

## Migration rules
- forward-only migrations in production
- rollback via compensating migrations
- no destructive migration without a deprecation window
- zero-downtime migration patterns for large tables
