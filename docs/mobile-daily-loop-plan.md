# Mobile Daily Loop Plan

This document defines the product loop, the required backend support, and the execution backlog for making the mobile app behave like a social operating layer rather than a generic chat shell.

This is the canonical execution document for the mobile daily-loop work. Future implementation should reference this file directly instead of re-deriving scope from ad hoc discussion.

## Daily Loop

The intended daily usage is:

1. Open `Home`
2. Understand current system state immediately
3. Check `Activity` for changes that matter
4. Go to `Chats` to coordinate with real people
5. Return to `Home` only when starting, refining, or recovering an intent

The app should optimize for:

- fast state comprehension
- visible progress toward real social outcomes
- low-noise agent guidance
- human chats as the action surface
- recovery when matching stalls

The app should not optimize for:

- long generic AI conversation
- feed browsing
- hidden navigation
- verbose process narration

## Primary Surface Model

### Home

Owns:

- current matching or coordination state
- one clear next move
- compact agent transcript
- structured outcome cards

Should answer:

- What is the system doing for me right now?
- What should I do next?

### Chats

Owns:

- direct chats
- group chats
- human coordination

Should answer:

- Who do I need to talk to?
- What conversation needs attention?

### Activity

Owns:

- action-required requests
- notifications and updates
- active intent status
- high-signal discovery suggestions

Should answer:

- What changed while I was away?
- What needs action now?

### Profile

Owns:

- identity
- preferences
- account configuration

## Backend Support Matrix

### Already Exists

- primary agent thread summary
- primary agent thread messages
- pending intent summary
- pending inbox requests
- passive discovery
- inbox suggestions
- direct and group chats
- notifications creation and read state
- sandbox-world world creation, join, tick, reset

### Added In This Slice

- `GET /experience/:userId/home-summary`
- `GET /experience/:userId/activity-summary`

These are product read models that remove stitched client-side aggregation from the main shell.

### Still Missing

- local snapshot versioning contract for `Home`, `Chats`, `Activity`, `Profile`
- lightweight unread summary endpoint for shell badges and startup hydration
- daily-loop expectations folded into the broader eval matrix once the mobile contract settles

## Execution Backlog

## Execution Board

### Now

1. Validate the four sandbox scenarios directly in mobile and tighten any remaining ambiguous copy or routing:
   - `baseline`
   - `waiting_replies`
   - `activity_burst`
   - `stalled_search`
   Frontend files:
   - [HomeStatusHeader.tsx](/Users/cruciblelabs/Documents/openchat/apps/mobile/src/open-chat/HomeStatusHeader.tsx)
   - [HomeSpotlightCards.tsx](/Users/cruciblelabs/Documents/openchat/apps/mobile/src/open-chat/HomeSpotlightCards.tsx)
   - [ActivityScreen.tsx](/Users/cruciblelabs/Documents/openchat/apps/mobile/src/screens/ActivityScreen.tsx)

2. Decide whether unread badge/bootstrap hydration needs its own lightweight store beyond the current `experience/bootstrap` path.
   Frontend files:
   - [activity-store.ts](/Users/cruciblelabs/Documents/openchat/apps/mobile/src/store/activity-store.ts)
   - [home-shell-store.ts](/Users/cruciblelabs/Documents/openchat/apps/mobile/src/store/home-shell-store.ts)
   Backend files:
   - [experience.service.ts](/Users/cruciblelabs/Documents/openchat/apps/api/src/experience/experience.service.ts)

### Next

4. Add daily-loop expectations to the broader eval matrix after the mobile contract stops moving.
   Eval files:
   - [/Users/cruciblelabs/Documents/openchat/scripts/evals/system/run-system-evals.mjs](/Users/cruciblelabs/Documents/openchat/scripts/evals/system/run-system-evals.mjs)
   - [/Users/cruciblelabs/Documents/openchat/scripts/evals/golden/product-critical-goldens.mjs](/Users/cruciblelabs/Documents/openchat/scripts/evals/golden/product-critical-goldens.mjs)

### Later

9. Add server-owned activity ranking and grouping policy.
   Backend files:
   - [experience.service.ts](/Users/cruciblelabs/Documents/openchat/apps/api/src/experience/experience.service.ts)
   - [notifications.service.ts](/Users/cruciblelabs/Documents/openchat/apps/api/src/notifications/notifications.service.ts)
   - [inbox.service.ts](/Users/cruciblelabs/Documents/openchat/apps/api/src/inbox/inbox.service.ts)
   - [discovery.service.ts](/Users/cruciblelabs/Documents/openchat/apps/api/src/discovery/discovery.service.ts)

10. Add sandbox-world scenario switching for daily-loop testing.
    Backend files:
    - [admin-playground.service.ts](/Users/cruciblelabs/Documents/openchat/apps/api/src/admin/admin-playground.service.ts)
    - [admin-sandbox-worlds.ts](/Users/cruciblelabs/Documents/openchat/apps/api/src/admin/admin-sandbox-worlds.ts)
    Scripts/docs:
    - [playground-sandbox-world.mjs](/Users/cruciblelabs/Documents/openchat/scripts/playground-sandbox-world.mjs)
    - [staging-sandbox-world.md](/Users/cruciblelabs/Documents/openchat/docs/staging-sandbox-world.md)

11. Add eval coverage for home-agent noise and daily-loop regressions.
    Eval files:
    - [/Users/cruciblelabs/Documents/openchat/scripts/evals/system/run-system-evals.mjs](/Users/cruciblelabs/Documents/openchat/scripts/evals/system/run-system-evals.mjs)
    - [/Users/cruciblelabs/Documents/openchat/scripts/evals/replay/run-replay-evals.mjs](/Users/cruciblelabs/Documents/openchat/scripts/evals/replay/run-replay-evals.mjs)
    - [/Users/cruciblelabs/Documents/openchat/scripts/evals/golden/product-critical-goldens.mjs](/Users/cruciblelabs/Documents/openchat/scripts/evals/golden/product-critical-goldens.mjs)

### Blocked

12. Finalize server-driven activity prioritization policy.
    Blocker:
    - needs product decision on ordering between requests, notifications, active intents, and suggestions

13. Finalize the `Home` recovery policy contract.
    Blocker:
    - needs product decision on when `Home` should recommend widening, switching to group, or waiting

### Done

14. Added product read-model endpoints for daily-loop support.
    Backend files:
    - [experience.controller.ts](/Users/cruciblelabs/Documents/openchat/apps/api/src/experience/experience.controller.ts)
    - [experience.service.ts](/Users/cruciblelabs/Documents/openchat/apps/api/src/experience/experience.service.ts)
    - [experience.module.ts](/Users/cruciblelabs/Documents/openchat/apps/api/src/experience/experience.module.ts)

15. Added mobile API client support for the new experience read models.
    Frontend files:
    - [api.ts](/Users/cruciblelabs/Documents/openchat/apps/mobile/src/lib/api.ts)

16. Added staging sandbox world support for end-to-end product testing.
    Backend/docs/scripts:
    - [admin-playground.service.ts](/Users/cruciblelabs/Documents/openchat/apps/api/src/admin/admin-playground.service.ts)
    - [admin-playground.controller.ts](/Users/cruciblelabs/Documents/openchat/apps/api/src/admin/admin-playground.controller.ts)
    - [admin-sandbox-worlds.ts](/Users/cruciblelabs/Documents/openchat/apps/api/src/admin/admin-sandbox-worlds.ts)
    - [staging-sandbox-world.md](/Users/cruciblelabs/Documents/openchat/docs/staging-sandbox-world.md)

17. Promoted `Activity` to a first-class bottom tab in the mobile shell.
    Frontend files:
    - [AppBottomTabs.tsx](/Users/cruciblelabs/Documents/openchat/apps/mobile/src/components/AppBottomTabs.tsx)
    - [HomeScreenLayout.tsx](/Users/cruciblelabs/Documents/openchat/apps/mobile/src/screens/home/HomeScreenLayout.tsx)
    - [HomeScreen.tsx](/Users/cruciblelabs/Documents/openchat/apps/mobile/src/screens/HomeScreen.tsx)

18. Moved `Activity` to the backend `experience/activity-summary` read model.
    Frontend files:
    - [useActivityFeed.ts](/Users/cruciblelabs/Documents/openchat/apps/mobile/src/features/activity/hooks/useActivityFeed.ts)
    - [ActivityScreen.tsx](/Users/cruciblelabs/Documents/openchat/apps/mobile/src/screens/ActivityScreen.tsx)
    - [api.ts](/Users/cruciblelabs/Documents/openchat/apps/mobile/src/lib/api.ts)
    Backend files:
    - [experience.service.ts](/Users/cruciblelabs/Documents/openchat/apps/api/src/experience/experience.service.ts)
    - [experience.controller.ts](/Users/cruciblelabs/Documents/openchat/apps/api/src/experience/experience.controller.ts)

19. Added `HomeStatusHeader` backed by `experience/home-summary`.
    Frontend files:
    - [HomeStatusHeader.tsx](/Users/cruciblelabs/Documents/openchat/apps/mobile/src/open-chat/HomeStatusHeader.tsx)
    - [OpenChatScreen.tsx](/Users/cruciblelabs/Documents/openchat/apps/mobile/src/open-chat/OpenChatScreen.tsx)
    - [HomeScreen.tsx](/Users/cruciblelabs/Documents/openchat/apps/mobile/src/screens/HomeScreen.tsx)

20. Restructured `Activity` into stable sections so inbox-like action items live inside the primary `Activity` surface.
    Frontend files:
    - [useActivityFeed.ts](/Users/cruciblelabs/Documents/openchat/apps/mobile/src/features/activity/hooks/useActivityFeed.ts)
    - [ActivityScreen.tsx](/Users/cruciblelabs/Documents/openchat/apps/mobile/src/screens/ActivityScreen.tsx)

21. Split the `HomeScreen` render layer into per-surface containers to reduce shell coupling.
    Frontend files:
    - [HomeSurfaceContainer.tsx](/Users/cruciblelabs/Documents/openchat/apps/mobile/src/screens/home/containers/HomeSurfaceContainer.tsx)
    - [ChatsSurfaceContainer.tsx](/Users/cruciblelabs/Documents/openchat/apps/mobile/src/screens/home/containers/ChatsSurfaceContainer.tsx)
    - [ActivitySurfaceContainer.tsx](/Users/cruciblelabs/Documents/openchat/apps/mobile/src/screens/home/containers/ActivitySurfaceContainer.tsx)
    - [ProfileSurfaceContainer.tsx](/Users/cruciblelabs/Documents/openchat/apps/mobile/src/screens/home/containers/ProfileSurfaceContainer.tsx)
    - [HomeScreen.tsx](/Users/cruciblelabs/Documents/openchat/apps/mobile/src/screens/HomeScreen.tsx)

22. Added a shell bootstrap/read model for first-paint home state and activity badge hydration.
    Backend files:
    - [experience.service.ts](/Users/cruciblelabs/Documents/openchat/apps/api/src/experience/experience.service.ts)
    - [experience.controller.ts](/Users/cruciblelabs/Documents/openchat/apps/api/src/experience/experience.controller.ts)
    Frontend files:
    - [api.ts](/Users/cruciblelabs/Documents/openchat/apps/mobile/src/lib/api.ts)
    - [HomeScreen.tsx](/Users/cruciblelabs/Documents/openchat/apps/mobile/src/screens/HomeScreen.tsx)

23. Added local snapshot persistence for `Home` and `Activity` summaries using AsyncStorage-backed experience storage.
    Frontend files:
    - [experience-storage.ts](/Users/cruciblelabs/Documents/openchat/apps/mobile/src/lib/experience-storage.ts)
    - [HomeScreen.tsx](/Users/cruciblelabs/Documents/openchat/apps/mobile/src/screens/HomeScreen.tsx)
    - [useActivityFeed.ts](/Users/cruciblelabs/Documents/openchat/apps/mobile/src/features/activity/hooks/useActivityFeed.ts)

24. Added structured spotlight cards below the `Home` status so the active search and best lead are visible without opening another surface.
    Frontend files:
    - [HomeSpotlightCards.tsx](/Users/cruciblelabs/Documents/openchat/apps/mobile/src/open-chat/HomeSpotlightCards.tsx)
    - [OpenChatScreen.tsx](/Users/cruciblelabs/Documents/openchat/apps/mobile/src/open-chat/OpenChatScreen.tsx)

25. Added direct action affordances from `Home` status and spotlight cards into the right destinations.
    Frontend files:
    - [HomeStatusHeader.tsx](/Users/cruciblelabs/Documents/openchat/apps/mobile/src/open-chat/HomeStatusHeader.tsx)
    - [HomeSpotlightCards.tsx](/Users/cruciblelabs/Documents/openchat/apps/mobile/src/open-chat/HomeSpotlightCards.tsx)
    - [OpenChatScreen.tsx](/Users/cruciblelabs/Documents/openchat/apps/mobile/src/open-chat/OpenChatScreen.tsx)
    - [HomeScreen.tsx](/Users/cruciblelabs/Documents/openchat/apps/mobile/src/screens/HomeScreen.tsx)

26. Removed the remaining user-facing `Inbox` transient route and folded that path into `Activity`.
    Frontend files:
    - [useHomeTransientRoutes.tsx](/Users/cruciblelabs/Documents/openchat/apps/mobile/src/screens/home/hooks/useHomeTransientRoutes.tsx)
    - [ActivityScreen.tsx](/Users/cruciblelabs/Documents/openchat/apps/mobile/src/screens/ActivityScreen.tsx)

27. Locked the remaining `Home` and `Activity` product policy into the backend read models.
    Backend files:
    - [experience.service.ts](/Users/cruciblelabs/Documents/openchat/apps/api/src/experience/experience.service.ts)
    - [experience.controller.ts](/Users/cruciblelabs/Documents/openchat/apps/api/src/experience/experience.controller.ts)
    Tests:
    - [experience.service.spec.ts](/Users/cruciblelabs/Documents/openchat/apps/api/test/experience.service.spec.ts)
    - [experience.controller.spec.ts](/Users/cruciblelabs/Documents/openchat/apps/api/test/experience.controller.spec.ts)

28. Promoted `Home` and `Activity` summary hydration into explicit shell stores so the daily loop survives cold start and reconnect more cleanly.
    Frontend files:
    - [activity-store.ts](/Users/cruciblelabs/Documents/openchat/apps/mobile/src/store/activity-store.ts)
    - [home-shell-store.ts](/Users/cruciblelabs/Documents/openchat/apps/mobile/src/store/home-shell-store.ts)
    - [HomeScreen.tsx](/Users/cruciblelabs/Documents/openchat/apps/mobile/src/screens/HomeScreen.tsx)
    - [useActivityFeed.ts](/Users/cruciblelabs/Documents/openchat/apps/mobile/src/features/activity/hooks/useActivityFeed.ts)

29. Tightened scenario-specific `Home` and `Activity` presentation so structured state reads before the transcript.
    Frontend files:
    - [HomeStatusHeader.tsx](/Users/cruciblelabs/Documents/openchat/apps/mobile/src/open-chat/HomeStatusHeader.tsx)
    - [HomeSpotlightCards.tsx](/Users/cruciblelabs/Documents/openchat/apps/mobile/src/open-chat/HomeSpotlightCards.tsx)
    - [OpenChatScreen.tsx](/Users/cruciblelabs/Documents/openchat/apps/mobile/src/open-chat/OpenChatScreen.tsx)
    - [ActivityScreen.tsx](/Users/cruciblelabs/Documents/openchat/apps/mobile/src/screens/ActivityScreen.tsx)

27. Added server-owned `Activity` section ordering and labels so the client no longer hardcodes section titles.
    Backend files:
    - [experience.service.ts](/Users/cruciblelabs/Documents/openchat/apps/api/src/experience/experience.service.ts)
    Frontend files:
    - [api.ts](/Users/cruciblelabs/Documents/openchat/apps/mobile/src/lib/api.ts)
    - [useActivityFeed.ts](/Users/cruciblelabs/Documents/openchat/apps/mobile/src/features/activity/hooks/useActivityFeed.ts)

28. Added an operational `Needs attention` card under `Home` so pending requests and unread updates are visible without opening `Activity`.
    Frontend files:
    - [HomeSpotlightCards.tsx](/Users/cruciblelabs/Documents/openchat/apps/mobile/src/open-chat/HomeSpotlightCards.tsx)
    - [OpenChatScreen.tsx](/Users/cruciblelabs/Documents/openchat/apps/mobile/src/open-chat/OpenChatScreen.tsx)
    - [HomeScreen.tsx](/Users/cruciblelabs/Documents/openchat/apps/mobile/src/screens/HomeScreen.tsx)

29. Moved `Activity` row copy and discovery highlight rows into the backend `experience` payload so the mobile client no longer invents row titles, eyebrows, or summary rows.
    Backend files:
    - [experience.service.ts](/Users/cruciblelabs/Documents/openchat/apps/api/src/experience/experience.service.ts)
    Frontend files:
    - [api.ts](/Users/cruciblelabs/Documents/openchat/apps/mobile/src/lib/api.ts)
    - [useActivityFeed.ts](/Users/cruciblelabs/Documents/openchat/apps/mobile/src/features/activity/hooks/useActivityFeed.ts)
    - [ActivityRow.tsx](/Users/cruciblelabs/Documents/openchat/apps/mobile/src/features/activity/components/ActivityRow.tsx)

30. Added server-authored `Activity` row priorities so item ordering is no longer based on client heuristics.
    Backend files:
    - [experience.service.ts](/Users/cruciblelabs/Documents/openchat/apps/api/src/experience/experience.service.ts)
    Frontend files:
    - [api.ts](/Users/cruciblelabs/Documents/openchat/apps/mobile/src/lib/api.ts)
    - [activity-item.ts](/Users/cruciblelabs/Documents/openchat/apps/mobile/src/features/activity/domain/activity-item.ts)
    - [useActivityFeed.ts](/Users/cruciblelabs/Documents/openchat/apps/mobile/src/features/activity/hooks/useActivityFeed.ts)

31. Added an explicit `Home` recovery card for stalled searches so no-match guidance is visible structurally instead of only through the transcript.
    Backend files:
    - [experience.service.ts](/Users/cruciblelabs/Documents/openchat/apps/api/src/experience/experience.service.ts)
    Frontend files:
    - [api.ts](/Users/cruciblelabs/Documents/openchat/apps/mobile/src/lib/api.ts)
    - [HomeSpotlightCards.tsx](/Users/cruciblelabs/Documents/openchat/apps/mobile/src/open-chat/HomeSpotlightCards.tsx)

32. Reduced transcript noise by filtering repeated low-signal agent acknowledgements on mobile and shortening backend no-match/progress follow-up copy.
    Frontend files:
    - [OpenChatScreen.tsx](/Users/cruciblelabs/Documents/openchat/apps/mobile/src/open-chat/OpenChatScreen.tsx)
    Backend files:
    - [intents.service.ts](/Users/cruciblelabs/Documents/openchat/apps/api/src/intents/intents.service.ts)
    - [async-agent-followup.consumer.ts](/Users/cruciblelabs/Documents/openchat/apps/api/src/jobs/processors/async-agent-followup.consumer.ts)

33. Added an explicit `Home` coordination card for accepted momentum and waiting replies on the lead intent.
    Backend files:
    - [experience.service.ts](/Users/cruciblelabs/Documents/openchat/apps/api/src/experience/experience.service.ts)
    Frontend files:
    - [api.ts](/Users/cruciblelabs/Documents/openchat/apps/mobile/src/lib/api.ts)
    - [HomeSpotlightCards.tsx](/Users/cruciblelabs/Documents/openchat/apps/mobile/src/open-chat/HomeSpotlightCards.tsx)
    - [OpenChatScreen.tsx](/Users/cruciblelabs/Documents/openchat/apps/mobile/src/open-chat/OpenChatScreen.tsx)
    - [HomeScreen.tsx](/Users/cruciblelabs/Documents/openchat/apps/mobile/src/screens/HomeScreen.tsx)

34. Added deterministic sandbox-world scenario shortcuts for `baseline`, `waiting_replies`, `activity_burst`, and `stalled_search`.
    Backend files:
    - [admin-sandbox-world.schemas.ts](/Users/cruciblelabs/Documents/openchat/apps/api/src/admin/admin-sandbox-world.schemas.ts)
    - [admin-playground.controller.ts](/Users/cruciblelabs/Documents/openchat/apps/api/src/admin/admin-playground.controller.ts)
    - [admin-playground.service.ts](/Users/cruciblelabs/Documents/openchat/apps/api/src/admin/admin-playground.service.ts)
    Scripts/docs:
    - [playground-sandbox-world.mjs](/Users/cruciblelabs/Documents/openchat/scripts/playground-sandbox-world.mjs)
    - [staging-sandbox-world.md](/Users/cruciblelabs/Documents/openchat/docs/staging-sandbox-world.md)

35. Added direct chat handoff from the `Home` coordination card when an accepted lead-intent request already has a DM chat.
    Backend files:
    - [experience.service.ts](/Users/cruciblelabs/Documents/openchat/apps/api/src/experience/experience.service.ts)
    Frontend files:
    - [api.ts](/Users/cruciblelabs/Documents/openchat/apps/mobile/src/lib/api.ts)
    - [HomeSpotlightCards.tsx](/Users/cruciblelabs/Documents/openchat/apps/mobile/src/open-chat/HomeSpotlightCards.tsx)
    - [OpenChatScreen.tsx](/Users/cruciblelabs/Documents/openchat/apps/mobile/src/open-chat/OpenChatScreen.tsx)
    - [HomeScreen.tsx](/Users/cruciblelabs/Documents/openchat/apps/mobile/src/screens/HomeScreen.tsx)

36. Added controller/service regression coverage for sandbox scenario switching.
    Backend tests:
    - [admin-playground.controller.spec.ts](/Users/cruciblelabs/Documents/openchat/apps/api/test/admin-playground.controller.spec.ts)
    - [admin-playground.service.spec.ts](/Users/cruciblelabs/Documents/openchat/apps/api/test/admin-playground.service.spec.ts)

37. Added `ExperienceService` regression coverage for core daily-loop `Home` states: waiting, recovery, and coordination handoff.
    Backend tests:
    - [experience.service.spec.ts](/Users/cruciblelabs/Documents/openchat/apps/api/test/experience.service.spec.ts)
    - [experience.controller.spec.ts](/Users/cruciblelabs/Documents/openchat/apps/api/test/experience.controller.spec.ts)

### Phase 1: Product Contract

1. Finalize the daily-loop contract in product and code.
2. Promote `Activity` to a first-class bottom tab.
3. Collapse `Inbox` into `Activity` sections for the user-facing IA.

### Phase 2: Backend Read Models

4. Add `experience/home-summary`.
5. Add `experience/activity-summary`.
6. Add server-driven ranking/grouping rules for activity sections.
7. Add unread summary and shell bootstrap endpoint.

### Phase 3: Mobile Shell

8. Refactor the bottom tab shell to `Chats / Home / Activity / Profile`.
9. Split `HomeScreen.tsx` into per-surface containers.
10. Move transient route usage to true secondary routes only.

### Phase 4: Home Surface

11. Add `HomeStatusHeader`.
12. Add structured result cards below the home transcript.
13. Restrict visible home transcript to high-signal turns only.
14. Remove repeated or low-information agent acknowledgements.

### Phase 5: Activity Surface

15. Rebuild `Activity` on top of `experience/activity-summary`.
16. Section the feed into:
    - action required
    - updates
    - active intents
    - suggestions
17. Make activity locally persistent and resilient under reconnect.

### Phase 6: Sandbox-World Coverage

18. Add named sandbox scenarios:
    - fresh start
    - active search
    - no-match recovery
    - pending requests
    - accepted intro
    - busy notifications
19. Add quick operator commands for switching scenarios.

### Phase 7: Agent Quality

20. Tighten home-agent response policy.
21. Add eval cases for noisy home output.
22. Add telemetry for:
    - open app
    - check activity
    - open chat
    - refine intent
    - recover no-match

## Acceptance Criteria

The daily loop is working when a user can open the app and answer these within a few seconds:

- What is the system doing for me?
- What changed while I was away?
- Who can I talk to right now?
- What is the next best move?

## Working Rule

When continuing this initiative:

1. update this file first if scope changes
2. move tasks between `Now`, `Next`, `Later`, `Blocked`, and `Done`
3. keep frontend and backend changes tied to specific files or endpoints
4. use the `Now` section as the default implementation queue unless explicitly overridden
24. Added a dedicated staging sandbox validation workflow for daily-loop scenario checks.
    Workflow/docs:
    - [staging-sandbox-validate.yml](/Users/cruciblelabs/Documents/openchat/.github/workflows/staging-sandbox-validate.yml)
    - [staging-sandbox-world.md](/Users/cruciblelabs/Documents/openchat/docs/staging-sandbox-world.md)
