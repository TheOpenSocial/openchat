# Client Apps: Web & Mobile Architecture

## Goal

Support production-grade clients with consistent product behavior across:
- Web
- iOS
- Android

---

## Recommended App Split

### Web App
Use for:
- onboarding
- chat
- profile management
- admin and support tools
- growth/SEO surfaces if later needed

### Mobile Apps
Use for:
- realtime notifications
- spontaneous social usage
- presence
- location-aware experiences
- camera/profile photo updates

---

## Client Architecture Principles

1. API contracts shared from a typed schema source
2. state normalized around:
   - auth
   - profile
   - inbox
   - intents
   - connections
   - chat
3. websocket session resilient to reconnects
4. optimistic UI only where safe
5. feature flags from server
6. rule-driven UI surfaces for personalization

---

## Session Model

- short-lived access token
- refresh token rotation
- device registration for push
- server authoritative presence state

---

## Realtime Behavior

- websocket preferred
- graceful fallback to polling for critical screens if needed
- reconnect with backoff
- replay missed events from cursor

---

## Mobile-Specific Concerns

- push token registration lifecycle
- app foreground/background transitions
- silent push for inbox sync where permitted
- coarse location permission only when needed
- image uploads via signed URLs

---

## Web-Specific Concerns

- SSR only for public pages if introduced later
- avoid leaking private recommendation data in HTML
- strict CSP
- CSRF protections on cookie-backed flows

---

## Accessibility

Support:
- keyboard navigation
- screen readers
- reduced motion
- high contrast states
- dynamic text scaling on mobile

---

## Localization

Prepare for:
- localized time/date formatting
- multilingual profile fields
- localized push/email templates
- language-aware ranking and filtering
