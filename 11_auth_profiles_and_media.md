# 11 — Auth, Profiles, and Media

## Authentication
### Primary sign-in
Google Sign-In using OAuth 2.0 / OpenID Connect server-side web flow.

Why:
- low-friction onboarding
- verified identity anchor
- reduced fake-account friction
- familiar user experience

## Session model
Recommended:
- HTTP-only secure session cookie for web
- CSRF protections for state-changing requests
- rotating refresh/session strategy if token-based mobile clients are added

## Account linking
Support:
- Google as primary
- future additional providers behind same identity model
- one user can have multiple auth identities linked later

## Onboarding
Collect:
- display name
- avatar
- interests/topics
- activities
- availability defaults
- city/region optional
- trust/safety acknowledgements

## Profile pictures
### Flow
1. client requests upload intent
2. server returns signed URL or upload token
3. client uploads original to object storage
4. media-processing worker generates derivatives
5. moderation scan if policy requires
6. profile references approved derivative asset

### Derivatives
- thumbnail
- profile card size
- retina variant

## Media storage
- object storage bucket
- private originals where possible
- CDN-delivered derivatives
- signed URLs where needed

## Privacy controls
- hide city
- hide online status
- disable incoming requests
- topic/activity visibility controls
- block list
