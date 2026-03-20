# Media & Profile Image Pipeline

## Goal

Handle profile images and user-uploaded media safely and efficiently.

---

## Scope

V1:
- profile image upload
- image replacement
- image moderation checks
- thumbnail generation
- signed delivery URLs

Future:
- multiple profile photos
- short intro videos
- activity attachments

---

## Storage

Use object storage with:
- private originals
- derived public or signed variants
- lifecycle rules
- CDN in front of hot assets

Recommended buckets:
- user-media-originals
- user-media-derived
- moderation-quarantine

---

## Upload Flow

1. client requests upload session
2. backend issues signed upload URL
3. client uploads directly to storage
4. backend receives completion callback or polling confirmation
5. image job enqueued
6. derivatives generated
7. moderation checks run
8. profile updated if approved

---

## Processing Jobs

Queues:
- media.ingest
- media.transform
- media.moderate
- media.cleanup

Tasks:
- image validation
- EXIF stripping
- resizing
- thumbnail generation
- hash generation
- moderation classification
- quarantine if flagged

---

## Constraints

- allowed MIME types only
- max file size enforced client + server
- strip EXIF and geolocation metadata
- reject animated or unsupported formats unless allowed
- keep deterministic derivative sizes

---

## Moderation

At minimum:
- NSFW detection
- violence/gore
- impersonation/manual review path
- duplicate/spam image heuristics

Moderation results:
- approved
- rejected
- pending_review
- quarantined

---

## Data Model

Tables:
- media_assets
- media_derivatives
- moderation_events

Key fields:
- owner_user_id
- storage_key
- sha256
- width
- height
- mime_type
- moderation_state
- active_for_profile

---

## Security

- signed URLs only for private assets
- do not trust client-provided metadata
- virus scan if supporting broader file uploads later
- one active profile image pointer, versioned history behind the scenes

---

## Metrics

- upload success rate
- moderation reject rate
- image processing latency
- CDN cache hit rate
