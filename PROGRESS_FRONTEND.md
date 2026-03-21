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
| Read receipts / last seen | Not implemented | — |

## Motion (animations & transitions)

| Area | Status |
|------|--------|
| Mobile | `AnimatedScreen`, Reanimated, theme `motion.pressOpacity` on presses |
| Web | Tab/card `animate-rise`, `transition-colors`, `animate-pulseSoft` on status dot |
| Shared page transitions | No formal route-level transition system |

## Buttons & interactive states

| Pattern | Web | Mobile |
|---------|-----|--------|
| Disabled while loading | Agent send button | `MessageComposer` `editable={!sending}`, send gated by `canSend` |
| Press / focus feedback | `hover:brightness`, `disabled:opacity` | `Pressable` opacity from theme |
| Full design-system matrix | Partial | Partial (see `04_design_system.md` for target) |

## Private chat: reactions & rich features

| Feature | Status |
|---------|--------|
| Message reactions (emoji) | **Not implemented** — no API or UI |
| Threads / replies | **Not implemented** in clients |
| Edit / delete message | **Not implemented** |
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
- Added `GET /api/agent/threads/me/summary` and wired web + mobile agent home to **chat** vs **intent** modes.
- Added locale switching baseline (`en`/`es`) with persistent client locale settings on web/mobile/admin.
- Added URL-based tab deep-links (`?tab=`) on web home tabs and admin workbench tabs.
- Added offline gating + NetInfo (mobile) / `online` events (web).
- Introduced minimal `src/i18n/strings.ts` stubs (English-only).
- Admin Agent panel: **Run agentic respond** for debugging full turns.
