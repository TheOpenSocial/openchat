# OpenSocial Frontend Tasks

This file is the rolling execution slice for the **frontend completion pass**.
It is intentionally scoped around **mobile-first productization** of backend
capabilities that already exist, while preserving the current visual direction
of `home`, `chats`, and `profile`.

Last refreshed: 2026-04-09

## Guardrails

- Do not redesign the existing `home`, `chats`, or `profile` surfaces.
- Build new destinations, controllers, and reusable blocks around the current
  shell.
- Follow [apps/mobile/docs/human-first-code-guide.md](/Users/cruciblelabs/Documents/openchat/apps/mobile/docs/human-first-code-guide.md):
  - screens compose
  - hooks own workflows
  - domain files stay pure
- Realtime state must be isolated from broad screen rerenders.
- New product screens should each have one dominant job. Avoid dashboard-card
  mosaics.

## Source Of Truth

- Product and app direction:
  - `README.md`
  - `00_overview.md`
  - `01_product_prd.md`
  - `03_user_flows.md`
  - `27_client_apps_web_mobile.md`
  - `FRONTEND_PROGRESS.md`
- Realtime and notifications:
  - `12_realtime_chat_presence.md`
  - `24_notifications_delivery_and_digests.md`
- Mobile implementation style:
  - `apps/mobile/docs/human-first-code-guide.md`
- Current shell and realtime client:
  - `apps/mobile/src/screens/HomeScreen.tsx`
  - `apps/mobile/src/lib/realtime.ts`
- Backend capability anchors:
  - `apps/api/src/realtime/realtime-events.service.ts`
  - `apps/api/src/inbox/inbox.controller.ts`
  - `apps/api/src/intents/intents.controller.ts`
  - `apps/api/src/discovery/discovery.controller.ts`
  - `apps/api/src/connections/connections.controller.ts`
  - `apps/api/src/notifications/notifications.controller.ts`
  - `apps/api/src/recurring-circles/recurring-circles.controller.ts`

## Capability Snapshot

### Already supported in backend

- Intent creation, retry, widen, cancel, summarize, convert
- Inbox request listing and actions
- Discovery suggestions and passive discovery
- Connection creation and setup flows
- Realtime non-chat events:
  - `request.created`
  - `request.updated`
  - `intent.updated`
  - `connection.created`
  - `moderation.notice`
- Notifications and digests
- Recurring circles
- Onboarding activation bootstrap

### Already supported in mobile

- Auth
- Onboarding
- Home agent thread
- Chats list + chat realtime
- Profile
- Settings
- Loading modal and upload flows

### Remaining frontend gaps

- Any remaining client polish after backend chat rollout settles

## Active Epic

`FE-03 Admin Dashboard Capability Coverage`

## Phase 1 Status

The mobile destination build-out is complete. The next frontend pass is
cross-client parity, shell hardening, and completion of still-missing
interaction surfaces.

## Current Focus

- [ ] `FE-03.1` Add first-class admin operations coverage for launch controls and security posture
  - Status:
    - completed in the Overview tab
  - Goal:
    - stop relying on the internal query helper for core operator controls that
      already have dedicated backend endpoints
  - Build:
    - dedicated launch-controls panel with current snapshot and safe mutations
    - security posture panel for `GET /api/admin/security/posture`
    - clear role-aware action states and audit-oriented copy
  - Evidence:
    - targeted admin lint / typecheck
    - manual verification against `/api/admin/launch-controls` and
      `/api/admin/security/posture`

- [ ] `FE-03.2` Add reliability and verification surfaces to the admin dashboard
  - Status:
    - completed in the Overview tab
  - Goal:
    - expose backend reliability/debugging endpoints as task-oriented UI instead
      of raw JSON only
  - Build:
    - verification-runs inspection
    - agent reliability snapshot
    - agent workflow / outcome drill-in entry points
  - Evidence:
    - admin screens can load current snapshots without the query helper

- [ ] `FE-03.3` Add scheduled-task and saved-search operator surfaces
  - Status:
    - completed in the Overview tab and mirrored into the user inspector
  - Goal:
    - make retention automation operable from admin, not only from user-facing
      web/mobile screens or the user inspector JSON dump
  - Build:
    - admin scheduled-task list and runs viewer
    - saved-search inspection tied to a selected user/task
    - admin pause / resume / archive / run-now actions with operator reasons
  - Evidence:
    - `pnpm --filter @opensocial/admin typecheck`
    - `pnpm --filter @opensocial/admin lint`

- [ ] `FE-03.4` Reduce dependence on the generic internal query helper
  - Status:
    - completed for the current admin slice; launch/security/reliability/scheduled-task/agent-ops flows moved out of the helper
  - Goal:
    - keep the helper for exceptional debugging, not routine operations
  - Build:
    - convert highest-frequency ops flows into typed panels/actions
    - leave the query helper as a secondary escape hatch
  - Evidence:
    - `pnpm --filter @opensocial/admin typecheck`
    - `pnpm --filter @opensocial/admin lint`

## Next Slice

- [ ] `FE-04` Admin polish and lower-frequency drill-in ergonomics
  - Status:
    - completed in the admin overview and agent surfaces
  - Goal:
    - tighten operator workflows without reopening broad capability gaps
  - Candidates:
    - richer per-item drill-in for agent action traces and workflow/outcome deep links
    - saved-search creation/edit affordances if admin needs write access beyond inspection
    - trim or preset the internal query helper further now that typed panels cover routine ops
  - Evidence:
    - `pnpm --filter @opensocial/admin typecheck`
    - `pnpm --filter @opensocial/admin lint`

- [ ] `FE-05` Admin workflow authoring and deeper trace ergonomics
  - Status:
    - trace ergonomics complete; workflow authoring remains backend-gated
  - Goal:
    - move from inspection-first tooling into higher-leverage operator composition
  - Candidates:
    - saved-search/task write flows if admin needs direct creation or repair
      blocker: current backend write routes are user-scoped rather than admin-scoped
    - richer agent trace correlation between actions, workflows, and thread messages
      completed in the Agent tab
    - smaller information-density and copy polish passes across admin tabs
  - Evidence:
    - `pnpm --filter @opensocial/admin typecheck`
    - `pnpm --filter @opensocial/admin lint`

- [ ] `BE/FE-06` Admin workflow authoring enablement
  - Goal:
    - add true admin-scoped saved-search/task creation or repair endpoints, then surface them in the dashboard
  - Dependencies:
    - backend admin write APIs for saved searches and scheduled-task creation/update

## Phase 1: Complete The Core Social Loop

- [x] `FE-01.1` Add `ActivityScreen` and header routing
  - Goal:
    - create the first general-purpose system destination without changing the
      existing tabs
  - Build:
    - `apps/mobile/src/features/activity/domain/*`
    - `apps/mobile/src/features/activity/hooks/useActivityFeed.ts`
    - `apps/mobile/src/features/activity/components/ActivityRow.tsx`
    - `apps/mobile/src/screens/ActivityScreen.tsx`
    - header badge / entry wiring from the existing app shell
  - Notes:
    - this should become the landing place for request, moderation, connection,
      and follow-up items

- [x] `FE-01.2` Add `InboxScreen` for pending requests
  - Goal:
    - give recipients a dedicated place to accept, reject, cancel, or bulk-act
      on requests
  - Backend anchors:
    - `GET /inbox/requests/:userId`
    - `POST /inbox/requests/:requestId/accept`
    - `POST /inbox/requests/:requestId/reject`
    - `POST /inbox/requests/:requestId/cancel`
    - `POST /inbox/requests/bulk`
  - Build:
    - `apps/mobile/src/features/inbox/domain/*`
    - `apps/mobile/src/features/inbox/hooks/useInboxRequests.ts`
    - `apps/mobile/src/features/inbox/hooks/useInboxRealtime.ts`
    - `apps/mobile/src/features/inbox/components/RequestRow.tsx`
    - `apps/mobile/src/features/inbox/components/RequestActionBar.tsx`
    - `apps/mobile/src/screens/InboxScreen.tsx`

- [x] `FE-01.3` Add `IntentDetailScreen` for outbound lifecycle tracking
  - Goal:
    - let senders understand what happened after an intent is submitted
  - Backend anchors:
    - `POST /intents`
    - `PATCH /intents/:intentId`
    - `GET /intents/:intentId/explanations`
    - `GET /intents/:intentId/explanations/user`
    - `POST /intents/:intentId/cancel`
    - `POST /intents/:intentId/retry`
    - `POST /intents/:intentId/widen`
    - `POST /intents/:intentId/convert`
  - Build:
    - `apps/mobile/src/features/intents/domain/*`
    - `apps/mobile/src/features/intents/hooks/useIntentStatus.ts`
    - `apps/mobile/src/features/intents/components/IntentStatusCard.tsx`
    - `apps/mobile/src/features/intents/components/IntentActionBar.tsx`
    - `apps/mobile/src/screens/IntentDetailScreen.tsx`

- [x] `FE-01.4` Centralize non-chat realtime state
  - Goal:
    - keep socket updates out of screen files and avoid broad rerenders
  - Event anchors:
    - `request.created`
    - `request.updated`
    - `intent.updated`
    - `connection.created`
    - `moderation.notice`
  - Build:
    - `apps/mobile/src/features/realtime/domain/non-chat-events.ts`
    - `apps/mobile/src/features/realtime/hooks/useNonChatRealtimeController.ts`
    - `apps/mobile/src/store/activity-store.ts`
    - `apps/mobile/src/store/inbox-store.ts`
    - targeted integration into `HomeScreen.tsx`

## Phase 2: Discovery And Activation

- [x] `FE-02.1` Add `DiscoveryScreen`
  - Goal:
    - prevent dead ends when there is no immediate connection result
  - Backend anchors:
    - `GET /discovery/:userId/tonight`
    - `GET /discovery/:userId/passive`
    - `GET /discovery/:userId/inbox-suggestions`
    - `POST /discovery/:userId/agent-recommendations`
  - Build:
    - `apps/mobile/src/features/discovery/domain/*`
    - `apps/mobile/src/features/discovery/hooks/useDiscoveryFeed.ts`
    - `apps/mobile/src/features/discovery/components/SuggestionRow.tsx`
    - `apps/mobile/src/features/discovery/components/PassiveAvailabilityCard.tsx`
    - `apps/mobile/src/screens/DiscoveryScreen.tsx`
  - Acceptance criteria:
    - passive discovery renders without blank states on first open
    - at least one useful fallback path is visible when there are no fresh matches
    - discovery items can open the right downstream destination once routing is wired
  - Verification:
    - `pnpm prettier --write apps/mobile/src/features/discovery apps/mobile/src/screens/DiscoveryScreen.tsx`
    - `pnpm -C apps/mobile lint`
    - `pnpm --filter @opensocial/mobile exec tsc -p tsconfig.json --noEmit`

- [x] `FE-02.2` Surface activation bootstrap after onboarding and no-match flows
  - Goal:
    - route users into the next-best action instead of dropping them back into
      the shell without explanation
  - Backend anchors:
    - `POST /onboarding/activation-bootstrap`
    - `POST /onboarding/activation-plan`
  - Build:
    - `apps/mobile/src/features/discovery/hooks/useActivationBootstrap.ts`
    - `apps/mobile/src/features/discovery/domain/activation-model.ts`
    - focused entry cards/sheets from onboarding and home

## Phase 3: Durable Relationship Surfaces

- [x] `FE-03.1` Add `ConnectionsScreen`
  - Goal:
    - separate “people I’m connected with” from the raw chat list
  - Backend anchors:
    - `POST /connections`
    - connection setup outputs and realtime `connection.created`
  - Build:
    - `apps/mobile/src/features/connections/domain/*`
    - `apps/mobile/src/features/connections/hooks/useConnections.ts`
    - `apps/mobile/src/features/connections/components/ConnectionRow.tsx`
    - `apps/mobile/src/screens/ConnectionsScreen.tsx`
  - Acceptance criteria:
    - connections render with stable ordering and clear empty state handling
    - tapping a connection can route to the existing chat or profile flow
    - the screen feels like a destination, not a redesign of the chat list
  - Verification:
    - `pnpm prettier --write apps/mobile/src/features/connections apps/mobile/src/screens/ConnectionsScreen.tsx`
    - `pnpm -C apps/mobile lint`
    - `pnpm --filter @opensocial/mobile exec tsc -p tsconfig.json --noEmit`

- [x] `FE-03.2` Deep-link activity and inbox items into chat/profile/connection
  - Goal:
    - make the system feel cohesive rather than a set of isolated screens
  - Build:
    - route helpers
    - navigation mappers
    - item-to-destination contracts in `domain/*`

## Phase 4: Retention Surfaces

- [x] `FE-04.1` Add `RecurringCirclesScreen`
  - Backend anchors:
    - recurring circles controller and session/member endpoints
  - Build:
    - `apps/mobile/src/features/recurring/domain/*`
    - `apps/mobile/src/features/recurring/hooks/useRecurringCircles.ts`
    - `apps/mobile/src/features/recurring/components/CircleRow.tsx`
    - `apps/mobile/src/features/recurring/components/CircleSessionRow.tsx`
    - `apps/mobile/src/screens/RecurringCirclesScreen.tsx`

- [x] `FE-04.2` Add saved-search and scheduled-task surfaces
  - Goal:
    - expose backend retention utilities without polluting the main shell
  - Build:
    - `apps/mobile/src/features/tasks/domain/*`
    - `apps/mobile/src/features/tasks/hooks/useSavedSearches.ts`
    - `apps/mobile/src/features/tasks/hooks/useScheduledTasks.ts`
    - `apps/mobile/src/screens/SavedSearchesScreen.tsx`
    - `apps/mobile/src/screens/ScheduledTasksScreen.tsx`

## Phase 5: Mobile Lifecycle Polish

- [x] `FE-05.1` Add notification registration and deep-link routing
  - Goal:
    - complete the mobile lifecycle after the main destinations exist
  - Build:
    - device token registration
    - foreground/background handling
    - notification tap routing into activity/inbox/chat/settings
  - Acceptance evidence:
    - push registration now flows through the mobile shell without changing the core tab layout
    - notification listeners can resolve into app routes for activity, inbox, chat, and settings
    - the lifecycle stays isolated from `home`, `chats`, and `profile`

- [x] `FE-05.2` Add lightweight operator/debug visibility
  - Goal:
    - make realtime and request-state debugging faster during rollout
  - Build:
    - connection state visibility
    - last event timestamps
    - request sync diagnostics
    - safe development-only surfacing
  - Acceptance evidence:
    - debug surfaces can show push permission/token state and last notification/deeplink events
    - realtime diagnostics stay narrow and do not force broad screen rerenders
    - operator visibility remains development-oriented and non-invasive

## Remaining Frontend Gaps

These are the current cross-client items that remain open after the mobile
completion pass and audit:

- [ ] Admin dashboard coverage still trails backend capability
  - Missing first-class panels for launch controls, security posture,
    verification runs, agent reliability/workflows, and scheduled-task admin.

- [ ] Admin auth UX/docs are inconsistent with current API expectations
  - The dashboard uses Google session + admin headers; docs still mention a
    browser-entered admin API key path that is no longer implemented.

- [ ] Remove temporary debug tracing once runtime stability is confirmed
  - The dev-only loop tracer in `apps/mobile/App.tsx` should not remain as a
    permanent tracking mechanism.

## First Implementation Slices

- [x] Slice A
  - `ActivityScreen`
  - activity store
  - header badge
  - basic notification/activity routing

- [x] Slice B
  - `InboxScreen`
  - pending request fetching
  - accept/reject actions
  - `request.created` and `request.updated` realtime updates

- [x] Slice C
  - `IntentDetailScreen`
  - intent explanation fetch
  - retry / widen / cancel actions
  - `intent.updated` realtime updates

## Verification Baseline

For every mobile implementation slice:

- `pnpm prettier --write apps/mobile/src`
- `pnpm -C apps/mobile lint`
- `pnpm -C apps/mobile typecheck`

When a slice touches backend contracts or relies on new event paths, also run the
most targeted backend test coverage available for the touched controller/service.

## Notes

- This file is intentionally frontend-only. Do not merge backend epic planning
  into this document.
- When a slice is completed, move permanent closure evidence into
  `FRONTEND_PROGRESS.md` and refresh this file with the next incomplete slice.
