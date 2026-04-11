# Frontend progress & capability matrix

This file tracks **client-facing** behavior across **web** (`apps/web`), **mobile** (`apps/mobile`), and **admin** (`apps/admin`). Spec references: product flows in `03_user_flows.md`, realtime in `12_realtime_chat_presence.md`.

## Agent home composer

| Capability | Web | Mobile | Notes |
|------------|-----|--------|--------|
| Load primary thread | Yes | Yes | `GET /api/agent/threads/me/summary`, then `GET .../messages` to hydrate transcript |
| **Agent chat** mode (`POST .../respond`) | Yes | Yes | Default mode; refreshes transcript from server after turn; API accepts optional `voiceTranscript` + `attachments` (clients can pass via `api.agentThreadRespond` `extras`) |
| **Intent queue** mode (`POST /intents`) | Yes | Yes | Optional; sends `agentThreadId` when a primary thread exists |
| Token streaming UI | Yes | Yes | `POST .../respond/stream` + correlated `traceId` + `GET .../stream?access_token=` SSE (`agent.message`); `extractResponseTokenDelta` in `@opensocial/types` filters `response_token` workflow rows |
| Optional `image_url` attachment (composer URL field) | Yes | Yes | Valid http(s) URL → `attachments` on stream/respond |
| Admin: debug respond | Yes | — | Admin → Agent → **Run agentic respond** |

## Internationalization (i18n)

| | Status |
|--|--------|
| **Libraries** | Lightweight typed catalogs (`en`, `es`) with app-level locale persistence (`localStorage` web/admin, `AsyncStorage` mobile) |
| **Pattern** | `apps/*/src/i18n/strings.ts` + locale-aware `t(key, locale)`; admin shell catalog in `apps/admin/app/lib/i18n.ts` |
| **UI coverage** | Baseline complete for key shared strings (agent tab + offline copy + language selector controls in web/mobile profile and admin shell) |

## Online / offline

| Surface | Implementation |
|---------|----------------|
| Web | `window` `online` / `offline` + `navigator.onLine`; header status dot + `InlineNotice` when offline; send disabled when offline |
| Mobile | `@react-native-community/netinfo`; `InlineNotice` when offline; blocks agent/intent send when offline |
| **True “other user online”** | Private chats use **realtime connection state** (socket), not a dedicated per-user presence API |

## Presence & indicators

| Indicator | Where | Meaning |
|-----------|-------|---------|
| Web header dot | `page.tsx` | Browser online/offline (not app server or chat partner) |
| Mobile `realtimeState` | Chats tab / realtime layer | Socket transport: connected vs disconnected vs offline |
| Typing | Chats | Realtime typing events when connected |
| Read receipts | Chats | Surfaced on mobile + web for delivered/read own-message status |
| Last seen | Implemented on web + mobile | Derived from chat metadata participant presence snapshots |

## Motion (animations & transitions)

| Area | Status |
|------|--------|
| Mobile | `AnimatedScreen`, Reanimated, theme `motion.pressOpacity` on presses |
| Web | Tab/card `animate-rise`, `transition-colors`, `animate-pulseSoft` on status dot |
| Shared page transitions | Yes | Mobile `RouteTransition` + web shell `RouteTransition`, both reduced-motion-safe |

## Buttons & interactive states

| Pattern | Web | Mobile |
|---------|-----|--------|
| Disabled while loading | Agent send button | `MessageComposer` `editable={!sending}`, send gated by `canSend` |
| Press / focus feedback | `hover:brightness`, `disabled:opacity` | `Pressable` opacity from theme |
| Full design-system matrix | Partial | Stronger token/contrast baseline on mobile shared inputs, chips, buttons, and shell controls |

## Route inventory snapshot

| Surface | Web | Mobile | Notes |
|---------|-----|--------|-------|
| Core shell | Yes | Yes | home / chats / profile remain the stable core surfaces |
| Discovery | Yes | Yes | mobile and web both have discovery entry points |
| Requests / inbox | Yes | Yes | web uses `requests`, mobile uses dedicated `InboxScreen` |
| Activity | Yes | Yes | parity landed with web system destination |
| Intent detail | Yes | Yes | web route added for outbound lifecycle tracking |
| Connections | Yes | Yes | parity landed with lightweight creation/history route |
| Recurring circles | Yes | Yes | implemented on both clients |
| Saved searches | Yes | Yes | dedicated route now exists on both clients |
| Scheduled tasks | Yes | Yes | dedicated route now exists on both clients |
| Settings | Yes | Yes | parity landed without replacing profile tab |
| Automations | Yes | No | web-only surface |

## Route parity gaps

The main remaining frontend work is follow-on polish rather than surface parity.

## Private chat: reactions & rich features

| Feature | Status |
|---------|--------|
| Message reactions (emoji) | Implemented on web + mobile |
| Threads / replies | Reply linkage + explicit reply affordances + server-derived threaded conversation drill-in implemented on web + mobile |
| Edit message | Implemented on web + mobile |
| Delete message | Soft delete for own messages implemented on web + mobile |
| Read receipts | Implemented on web + mobile |
| Report / block | Implemented (mobile Chats tab; web varies by screen) |

## Related backend / ops

- Agent contracts: `10_api_contracts.md`, `06_ai_agent_architecture.md`
- Admin E2E baseline: `apps/admin/e2e/admin-signin.spec.ts` + `apps/admin/playwright.config.ts`

## Implementation notes

- **Shared transcript mapping**: `agentThreadMessagesToTranscript` and `AgentTranscriptRow` live in `@opensocial/types` (`agent-transcript.ts`) so web and mobile stay aligned with API message roles.
- **Hooks**: `useNetworkOnline` / `usePrimaryAgentThread` (mobile), `useBrowserOnline` / `usePrimaryAgentThread` (web) isolate side effects; thread callbacks use **refs** so inline handlers do not refetch in a loop.

## Changelog (recent)

- Agent chat: **live token rendering** via thread SSE + `respond/stream` with client `traceId` correlation; web uses `EventSource`, mobile uses XHR incremental parse.
- Admin **Moderation** tab: **Agent thread risk flags** panel (`GET /admin/moderation/agent-risk-flags`, triage + assign actions).
- Admin **Overview** tab now includes first-class panels for launch controls, security posture, agent reliability, and verification-run snapshots instead of relying only on the generic query helper.
- Admin **Overview** now also includes a typed scheduled-task operator panel with saved-search inspection, run history, and pause / resume / archive / run-now actions; the user inspector reuses the same typed snapshots and actions.
- Admin **Overview** now includes typed **Agent Outcomes** and **Agent Actions** panels, so routine explainability and trace triage no longer depend on raw debug queries.
- Admin **Overview** now adds typed workflow list/detail drill-ins, and the **Agent** tab shows thread follow-through plus richer trace context instead of only flat JSON dumps.
- Admin **Agent** now correlates thread inspection with recent agent actions and workflow runs/details, so operator trace work no longer has to jump between unrelated panels.
- Added `GET /api/agent/threads/me/summary` and wired web + mobile agent home to **chat** vs **intent** modes.
- Added locale switching baseline (`en`/`es`) with persistent client locale settings on web/mobile/admin.
- Added URL-based tab deep-links (`?tab=`) on web home tabs and admin workbench tabs.
- Added offline gating + NetInfo (mobile) / `online` events (web).
- Mobile shell lifecycle polish landed: push registration, notification deep-link routing, and lightweight diagnostics were added without changing the core `home` / `chats` / `profile` layouts.
- Web parity landed for activity, connections, settings, intent detail, saved searches, and scheduled tasks routes.
- Shared reduced-motion-safe route transitions landed in both shells.
- Rich chat moved beyond quoted replies: reply linkage, reactions, server-derived thread drill-in, message editing, soft delete, read receipts, and last-seen presence are now shipped on web and mobile.
- Introduced minimal `src/i18n/strings.ts` stubs (English-only).
- Admin Agent panel: **Run agentic respond** for debugging full turns.
