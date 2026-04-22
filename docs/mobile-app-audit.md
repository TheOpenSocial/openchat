# Mobile App Audit

This document tracks the current mobile-only product state, with emphasis on
real wiring, shared state architecture, and automation coverage.

For the standalone scorecard view, see
[/Users/cruciblelabs/Documents/openchat/docs/mobile-readiness-matrix.md](/Users/cruciblelabs/Documents/openchat/docs/mobile-readiness-matrix.md).

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

## Readiness Scale

- `1-3`: concept or partial wiring only
- `4-6`: real implementation exists, but important automation or recovery gaps remain
- `7-8`: strong working shape with limited known edge instability
- `9`: release-candidate quality for the current scope
- `10`: fully dependable, polished, and strongly automated

## Mobile Readiness Matrix

### Product Surfaces

| Surface / Flow | Readiness | Status | What it does | Why it has this score |
| --- | --- | --- | --- | --- |
| Auth entry | `8/10` | `strong` | Gets a user into the app and hands off to onboarding or session restore | Real screen wiring and E2E bypass are solid; broader shell churn can still interfere during long local runs |
| Onboarding landing | `8/10` | `strong` | Presents the authored hero, cycling phrases, and first-run prompt | The designed motion system is intact and the flow is wired; still needs final visual polish and broader automated coverage |
| Onboarding completion | `7/10` | `strong` | Completes profile setup and enters the app shell | Real path works and bypass exists for automation; still under-covered in the broader mobile audit |
| Home | `8/10` | `strong` | Shows the main runtime state, seed prompt, and agent guidance | Real API-backed content is rendering well; minimalist polish and more route-level automation remain |
| Activity | `9/10` | `very strong` | Shows action-needed sections, summary guidance, and utility quick links | This is currently the best-instrumented and best-automated mobile surface |
| Inbox | `8/10` | `strong` | Lets users review and act on requests | Real route wiring is proven and local sweep coverage reaches it reliably |
| Connections | `8/10` | `strong` | Opens the connections surface and returns to Activity | Proven in the broad local sweep, though later-loop shell churn still exists |
| Discovery | `7/10` | `strong` | Opens passive discovery and activation summaries | Reachable and wired; broad-sweep return proof is still being completed |
| Recurring circles | `7/10` | `strong` | Opens recurring circle utilities and run-now flows | Narrow route support is there; full broad-sweep proof still pending |
| Saved searches | `7/10` | `strong` | Opens saved-search management | Wired and reachable in the route graph; broad-sweep proof still pending |
| Scheduled tasks | `7/10` | `strong` | Opens scheduled-task management | Wired and reachable in the route graph; broad-sweep proof still pending |
| Intent detail | `7/10` | `strong` | Shows a live intent and its state transitions | Data path is real, but this surface still needs stronger local route automation |
| Chats surface | `6/10` | `usable` | Hosts the main conversation shell | Core shell is real, but deep traversal, thread modal, resilience, and safety flows are still under-audited |
| Profile | `7/10` | `strong` | Hosts self-profile editing, interests, preferences, and session actions | Route wiring is real and primary action selectors now exist, but edit/persistence automation is still missing |
| Settings | `7/10` | `strong` | Hosts identity settings and protocol integrations | Route wiring is real and major controls now have selectors, but persistence and protocol-panel automation are still thin |
| Other user profile | `6/10` | `usable` | Opens a counterparty profile from inbox, discovery, connections, or chats | Wired and now explicitly identifiable, but still lacks strong traversal automation |
| Home -> Activity -> utility loop | `8/10` | `strong` | Lets a user move from the core shell into operational utility surfaces | This is now the best proven cross-surface chain in the app |

### Automation / Verification Lanes

| Lane | Readiness | Status | What it proves | Why it has this score |
| --- | --- | --- | --- | --- |
| `mobile-critical-path.yaml` | `8/10` | `strong` | Basic auth, onboarding, shell boot, settings, and Activity entry | Stable baseline lane, but not yet our richest realism path |
| `mobile-daily-loop.yaml` | `7/10` | `strong` | The shell can complete a daily-loop style pass | Useful baseline, but narrower than the newer sandbox-backed lanes |
| `mobile-route-graph.yaml` | `6/10` | `usable` | Important screens are reachable and closable through the app graph | Good structural coverage, but still noisy under Expo/dev-client overlays |
| `mobile-surface-smoke.yaml` | `5/10` | `partial` | Fresh-boot reachability for major surfaces on the native dev app | Still blocked by native dev-client boot instability |
| `mobile-sandbox-surface-smoke.yaml` | `5/10` | `partial` | Native sandbox-backed surface reachability | Data is good, but native attach remains the blocker |
| `test:mobile:sandbox:maestro` | `7/10` | `strong` | End-to-end scenario prep, session injection, Expo boot, and Maestro launch | Strong as a runner/orchestration lane; final simulator-wrapper stability still limits it |
| `mobile-sandbox-home-activity-expo-go-attached.yaml` | `9/10` | `very strong` | Real API-backed Home and Activity assertions on Expo Go | This is our cleanest local proof lane right now |
| `mobile-sandbox-activity-target-expo-go-attached.yaml` | `8/10` | `strong` | One Activity quick-link target per attached Expo Go run | Strong decomposition lane; still occasionally subject to local bridge churn |
| `mobile-sandbox-surface-smoke-expo-go-current.yaml` | `7/10` | `strong` | One attached Expo Go session that walks the broad utility chain | Now clears boot, Inbox, Connections, and reaches Discovery; remaining red is late-loop Expo shell recovery |
| Profile / settings route reachability | `7/10` | `strong` | Proves bottom-tab Profile entry plus Settings open/close on the current shell | Now backed by explicit screen ids instead of only a close button assertion |
| Staging mobile session workflow | `8/10` | `strong` | CI can mint a usable mobile session artifact | Backend support is solid; still needs stronger end-to-end mobile consumer coverage |

### Architecture / Foundations

| Area | Readiness | Status | What it does | Why it has this score |
| --- | --- | --- | --- | --- |
| App shell + tabs | `8/10` | `strong` | Hosts primary navigation and tab movement | Stable and already supporting the current audit work well |
| Local UI state layer | `8/10` | `strong` | Handles shell, badges, and local runtime state | Lightweight and effective; no major blockers found in the current pass |
| Server state layer | `9/10` | `very strong` | Centralizes network-backed mobile state through React Query | This is one of the strongest parts of the current mobile architecture |
| Offline/session lifecycle | `8/10` | `strong` | Restores sessions and recovers from transient backend issues | Good behavior in practice, though still not exhaustively audited |
| Transient route graph | `9/10` | `very strong` | Wires mobile operational surfaces into one consistent overlay model | This is now clearly real and not just aspirational wiring |

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
| `mobile-sandbox-surface-smoke-expo-go-current.yaml` | `in_progress` | The single-invocation broad sweep now clears boot, Inbox, and Connections and reaches Discovery; the remaining instability is late-loop Expo shell recovery rather than missing mobile routes |

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
- Home now stays usable when the primary agent-thread load hits a temporary
  `abuse_throttled` condition and a valid summary is already present, so local
  mobile automation does not collapse back into the reconnect shell during an
  otherwise healthy session.

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

## Mobile Execution Board

This is the concrete mobile-only punch list we are driving now so the app does
not drift into scattered notes or vague “polish later” work.

| # | Item | Status | Notes |
| --- | --- | --- | --- |
| 1 | Shared React Query client wired into the mobile shell | `done` | Core server-state layer is in place |
| 2 | Auth/session restore works with E2E session injection | `done` | Real session artifacts can boot the app |
| 3 | Inbox promoted into the transient route graph | `done` | No longer an orphan surface |
| 4 | Connections reachable from Activity | `done` | Wired through the quick-link lane |
| 5 | Discovery reachable from Activity | `done` | Wired through the quick-link lane |
| 6 | Recurring circles reachable from Activity | `done` | Route exists and closes correctly in narrow flows |
| 7 | Saved searches reachable from Activity | `done` | Route exists and closes correctly in narrow flows |
| 8 | Scheduled tasks reachable from Activity | `done` | Route exists and closes correctly in narrow flows |
| 9 | Intent detail wired to live status data | `done` | Backed by `useIntentStatus` |
| 10 | Activity quick links stabilized for E2E/dev | `done` | Stable ids and vertical stack near the top |
| 11 | Operation screens use automation-safe close controls | `done` | E2E/dev avoids brittle icon hits |
| 12 | Agent-style briefing layer on Home | `done` | Structured state plus guidance |
| 13 | Agent-style briefing layer on Inbox | `done` | Structured requests plus summary guidance |
| 14 | Agent-style briefing layer on Activity | `done` | Structured sections plus summary guidance |
| 15 | Onboarding cycling phrases preserved | `done` | User-authored motion copy stays intact |
| 16 | Onboarding video/blob hero preserved | `done` | No flattening of the authored concept |
| 17 | Onboarding entry spacing softened for small screens | `done` | Lower pressure without changing the design language |
| 18 | Auth/onboarding/welcome bypass hooks for local Maestro | `done` | Present only in dev/E2E-safe paths |
| 19 | Sandbox-backed mobile session runner | `done` | Local app can boot from real API-backed data |
| 20 | Cached scenario/session artifacts for fast local iteration | `done` | Local reruns avoid constant GitHub prep churn |
| 21 | Single-target Activity audit path | `done` | Utility surfaces can be isolated one by one |
| 22 | Single-flight guard for the broad local runner | `done` | Broad sweeps no longer compete for the same simulator |
| 23 | Broad Activity quick-link sweep in one Maestro flow | `in_progress` | Now clears boot, Inbox, and Connections inside one attached Expo Go session |
| 24 | Reliable return-to-Activity recovery after every utility route | `in_progress` | Stronger than before, but late-loop shell churn remains |
| 25 | Expo Go tools-sheet dismissal stability | `in_progress` | Still the biggest local flake source |
| 26 | Auth/onboarding/welcome recovery during late-loop reruns | `in_progress` | Better than before, not yet fully dependable |
| 27 | Connections close-and-return assertion in the broad sweep | `done` | Latest local broad sweep returned to Activity and advanced into Discovery |
| 28 | Discovery close-and-return assertion in the broad sweep | `in_progress` | Discovery is now reached in the broad sweep; return proof is the next check |
| 29 | Recurring circles close-and-return assertion in the broad sweep | `todo` | Needs proof inside the single-invocation lane |
| 30 | Saved searches close-and-return assertion in the broad sweep | `todo` | Needs proof inside the single-invocation lane |
| 31 | Scheduled tasks close-and-return assertion in the broad sweep | `todo` | Needs proof inside the single-invocation lane |
| 32 | Chats traversal automation | `todo` | Still missing from the strongest local audit lane |
| 33 | Chat shell automation selectors | `done` | Chats now exposes stable ids for thread rows, thread modal, moderation actions, reply/edit banners, and reactions |
| 34 | Profile/settings route refresh on the current shell | `done` | Profile, Settings, and Other Profile now expose stable screen ids and route-graph coverage was widened |
| 35 | Profile edit-and-persist Maestro lane | `todo` | Bio, location, interests, and preferences still need persistence assertions |
| 36 | Settings rename-and-persist Maestro lane | `todo` | First/last name save still needs a durable automation pass |
| 37 | Protocol integrations panel happy-path lane | `todo` | Load webhooks, load activity, inspect queue, and replay dead letters should be audited separately |
| 38 | Chat core Maestro lane | `todo` | `tab -> select thread -> send -> reply -> open thread -> close` is still missing |
| 39 | Chat resilience lane | `todo` | queued / failed / retry behavior still needs proof |
| 40 | Chat safety lane | `todo` | View profile, report, and block from chats still need proof |
| 41 | Local Expo Go sweep promoted into CI-safe mobile lane | `todo` | Needs a dependable wrapper strategy first |
| 42 | Minimalist polish pass on Home | `todo` | After the broad sweep is stable |
| 43 | Minimalist polish pass on Activity | `todo` | After the broad sweep is stable |
| 44 | Minimalist polish pass on Inbox | `todo` | After the broad sweep is stable |
| 45 | Minimalist polish pass on onboarding landing | `todo` | Preserve authored motion while reducing visual pressure |
