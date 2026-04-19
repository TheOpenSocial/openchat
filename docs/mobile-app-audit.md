# Mobile App Audit

This document tracks the current mobile-only product state, with emphasis on
real wiring, shared state architecture, and automation coverage.

## Current Architecture

| Area | Status | What it does | Current shape |
| --- | --- | --- | --- |
| App shell + tabs | `green` | Hosts Home, Chats, Activity, and Profile | Custom shell state via external stores; route overlays handled in the Home transient route layer |
| UI state | `green` | Handles shell, chats, activity badges, inbox counts, and debug state | Lightweight store pattern built with `useSyncExternalStore`; effectively Redux-like without a separate Redux dependency |
| Server state | `green` | Fetches and mutates mobile backend data | Shared React Query client now drives inbox, discovery, activation bootstrap, activity, connections, recurring circles, saved searches, scheduled tasks, and intent status |
| Offline/session lifecycle | `green` | Session restore, refresh, and offline recovery | Async storage for session/cache plus app-level auth lifecycle hooks |
| Route overlays | `green` | Full-screen operational/product surfaces from Home/Activity | Inbox, Discovery, Connections, Recurring Circles, Saved Searches, Scheduled Tasks, Settings, Intent Detail, and Other Profile are all part of the transient route graph |

## Feature Matrix

| Feature | Status | What users can do | Wiring proof |
| --- | --- | --- | --- |
| Auth + onboarding | `green` | Enter the app and complete first-run profile setup | `AuthScreen`, `OnboardingFlow`, existing Maestro critical path |
| Home | `green` | Review runtime state, send intent seeds, move into the main shell | `HomeScreen`, `HomeSurfaceContainer` |
| Activity | `green` | Review action-required items, intent updates, discovery signals, and quick links | `ActivityScreen`, `useActivityFeed` |
| Inbox | `green` | Accept and reject incoming requests | `InboxScreen`, `useInboxRequests`, now reachable from Activity and push routing |
| Connections | `green` | Inspect existing chats/connections and open profile/chat follow-ups | `ConnectionsScreen`, `useConnections` |
| Discovery | `green` | Review passive discovery, inbox suggestions, and activation summaries | `DiscoveryScreen`, `useDiscoveryFeed`, `useActivationBootstrap` |
| Recurring circles | `green` | Inspect recurring groups and trigger a run-now action | `RecurringCirclesScreen`, `useRecurringCircles` |
| Saved searches | `green` | Review and delete saved searches | `SavedSearchesScreen`, `useSavedSearches` |
| Scheduled tasks | `green` | Review, run, pause/resume, and archive scheduled jobs | `ScheduledTasksScreen`, `useScheduledTasks` |
| Intent detail | `green` | Inspect a live intent and run lifecycle actions | `IntentDetailScreen`, `useIntentStatus` |
| Settings | `green` | Inspect profile/settings surfaces and protocol integrations | `SettingsScreen` |

## Automation Matrix

| Lane | Status | What it proves |
| --- | --- | --- |
| `mobile-critical-path.yaml` | `green` baseline | Auth bypass, onboarding, home shell, settings open/close, and Activity entry work |
| `mobile-daily-loop.yaml` | `green` baseline | The local shell can boot into a daily-loop style home/activity pass |
| `mobile-surface-smoke.yaml` | `new` | The main mobile operational surfaces are each reachable from a fresh boot in native Maestro runs |
| `mobile-sandbox-surface-smoke.yaml` | `new` | Verifies native mobile surfaces against a sandbox-world API scenario, not only local bypass data |
| `mobile-route-graph.yaml` | `new` | The important mobile operational surfaces are actually reachable and closable through the app graph |
| `test:mobile:sandbox:maestro` | `new` | Prepares a sandbox scenario, injects a real mobile session, starts Expo, and runs Maestro against API-backed data |
| `mobile-sandbox-home-activity-expo-go-attached.yaml` | `new` | Validates the strongest local attached Expo Go base path for real `Home` and `Activity` data before deeper route sweeps |
| `mobile-sandbox-activity-target-expo-go-attached.yaml` | `new` | Validates one Activity quick-link target per fresh attached Expo Go session so longer route sweeps can be decomposed into stable checks |
| Staging mobile session workflow | `green` backend support | CI can emit a usable staged session artifact for backend-backed mobile runs |

## Key Fixes In This Pass

- Added a shared mobile React Query layer and finished adoption across the main
  fetch-heavy mobile hooks.
- Promoted Inbox into the real transient route graph instead of leaving it as an
  orphaned screen.
- Added stable surface test IDs for the main operational screens to support
  route-graph automation.
- Added a dedicated Maestro route-graph flow to validate mobile shell reachability.
- Added a dedicated Maestro surface-smoke flow that boots fresh for each major
  screen so mobile reachability can be validated even when close-transition
  timing is still being tightened.
- Added a sandbox-backed mobile runner and flow so `Home` and `Activity` can be
  checked against real API scenario data instead of local-only bypass mode.
- Hardened the sandbox-backed runner with:
  - GitHub workflow fallback retries for scenario/session emission
  - automatic Expo port selection
  - native SpringBoard confirmation handling
  - Expo dev-client startup mode for native attach attempts

## Latest Maestro Evidence

| Lane | Result | Notes |
| --- | --- | --- |
| `mobile-route-graph.yaml` on Expo Go | `partial` | Reached `home-screen`, `activity-screen`, and `inbox-screen`; still noisy because Expo Go/dev-client overlays interfere with return-navigation assertions |
| `mobile-surface-smoke.yaml` on native dev app id | `partial` | Reached `home-screen`, `activity-screen`, and `inbox-screen`; later fresh-boot repetitions still show dev-client boot/overlay instability before the remaining surfaces are exercised |
| `test:mobile:sandbox:maestro` | `partial` | Canonical API-backed mobile audit lane; sandbox scenario prep and real-session injection are green, but native dev-client cold-launch still fails before `home-screen` due Expo attach limitations on the simulator path |
| `mobile-sandbox-home-activity-expo-go-attached.yaml` | `green` local base lane | Repeated local runs reached and asserted both `A match is moving` and `What needs your attention` using a real API-backed session on Expo Go |
| `mobile-sandbox-activity-target-expo-go-attached.yaml` | `partial` | The shorter per-target shape is better than the old monolithic route sweep, but the remaining failures are still dominated by intermittent iOS XCTest bridge drops on `127.0.0.1:7001` before or during target taps |

Current interpretation:

- Mobile wiring is materially better than before this pass.
- The remaining Maestro red is now concentrated in native dev-client cold-launch
  behavior, Expo Go wrapper/reattach timing, and intermittent iOS XCTest bridge
  drops, not in broad missing mobile routes or missing API data.
- Settings and full return-navigation sweeps still need a cleaner native
  automation lane to become dependable release gates.
- The new attached Expo Go split proves the app can render real API-backed Home
  and Activity states locally without relying on the full SpringBoard handoff
  inside Maestro itself.
- The runner now supports a one-target-per-run Activity audit path, so Inbox,
  Connections, Discovery, Circles, Searches, and Tasks can be verified through
  the supported command surface without editing Maestro env by hand.

## Current Native Automation Blocker

- The sandbox-backed runner reliably:
  - prepares a sandbox-world scenario
  - emits a real mobile session
  - injects that session into the app environment
  - boots Expo and launches Maestro
- The remaining failure is the native attach handoff on the installed dev app:
  - the Simulator shows the SpringBoard confirmation sheet `Open in "OpenSocial"?`
  - once the app opens, the dev client still reports `No script URL provided`
  - the result is a native cold-launch failure before `home-screen` becomes visible
- This means the current blocker is no longer mobile feature wiring. It is the
  dev-client automation mechanism itself.
- The clean CI-safe paths from here are:
- install and use Expo Go for the sandbox-backed flow, or
- switch the native lane to a hosted update/manifest path rather than local
  dev-client cold-launch behavior
- keep the longer Activity quick-link audit decomposed into one-target-per-run
  attached Expo Go flows until the iOS XCTest bridge becomes less flaky

## Remaining Mobile Focus

| Area | Priority | Next step |
| --- | --- | --- |
| Chats/profile deep automation | High | Add broader Maestro coverage for chat-thread and profile traversals |
| Backend-backed mobile E2E | High | Promote the new attached Expo Go `home-activity` and per-target lanes into CI-grade scripts before restoring a broader multi-surface sweep |
| UX polish | Medium | Continue tightening onboarding-to-home voice and edge-state clarity |
| Performance profiling | Medium | Profile heavy chat/activity/discovery surfaces once the route graph is stable |
