# Mobile Readiness Matrix

Scale:
- `10/10`: production-ready and automation-backed
- `8-9/10`: strong, with only minor polish or breadth gaps
- `6-7/10`: functional, but still missing coverage or confidence
- `1-5/10`: incomplete, brittle, or under-audited

## Product Surfaces

| Surface | Readiness | Evidence | What still blocks `10/10` |
| --- | --- | --- | --- |
| Auth entry | `9/10` | Stable auth selectors plus a dev-only bypass and injected-session boot path are in place | Needs non-dev coverage for full release confidence |
| Onboarding landing | `8/10` | User-designed motion and cycling phrases preserved | Needs full path proof after landing |
| Onboarding completion | `7/10` | Current critical path drives onboarding to home | Needs dedicated completion regression lane |
| Home shell | `9/10` | `home-screen`, shell top bar, bottom tabs, and transient-safe E2E rail are wired | Needs broader interaction regression coverage |
| Home agent thread | `8/10` | Existing `mobile-critical-path.yaml` exercises composer path | Needs cleaner assertions and retry states |
| Activity / updates guidance | `7/10` | Present in app architecture but not deeply covered in this branch | Needs focused Maestro route audit |
| Chats list | `9/10` | Current-state injected-session mutation lane passed on 2026-04-21 through seeded thread selection and route entry | Still needs broader non-chat shell interaction breadth |
| Chat thread core | `9/10` | Current-state injected-session mutation lane passed on 2026-04-21 through edit, reaction, and delete assertions | Needs reply-specific coverage for full thread breadth |
| Chat thread modal | `9/10` | Current-state seeded thread lane passed on 2026-04-20 through thread modal open + close, with mutation lane now validating deeper thread actions | Needs one more non-happy-path modal proof |
| Profile overview | `9/10` | Current-state local lane now passes through `profile-screen` and both edit sections | Still needs a preferences-specific pass to hit full breadth |
| Profile bio persistence | `9/10` | Current-state local lane passed on 2026-04-19 through bio/location save assertion | Needs non-E2E-network coverage for full release confidence |
| Profile interests persistence | `9/10` | Current-state local lane passed on 2026-04-19 through interests save assertion | Needs a preferences or persisted-reopen companion lane |
| Profile preferences | `10/10` | Current-state local preferences lanes now pass through mode + notification save, exit, and reopen persistence on the stabilized `localhost:8090` Expo path | None on the current local MVP scope |
| Settings shell | `9/10` | Current-state local Maestro lane reaches `settings-screen` cleanly | Needs broader non-happy-path coverage |
| Settings identity persistence | `9/10` | Current-state local reopen lane passed on 2026-04-20 through save + close + reopen assertions | Still needs non-E2E-network confidence for full release trust |
| Protocol integrations panel | `8/10` | Current-state local Maestro lane asserts `settings-protocol-panel` after save | Needs richer action coverage |
| Other user profile | `8/10` | Current-state local peer-profile lane passed on 2026-04-20 through open + action-shell + close | Needs richer content and request/chat provenance coverage |
| Notifications entry | `9/10` | Current-state local entry + roundtrip lanes passed on 2026-04-20 through shell bell -> Activity -> shell recovery | Still needs unread-state coverage |
| Profile/media change flow | `6/10` | Upload path exists and screen actions are wired | Needs deterministic E2E strategy |
| Drawer/navigation resilience | `6/10` | Drawer route selectors exist | Open button path is stale in old Maestro flow |

## Automation Lanes

| Lane | Readiness | Evidence | What still blocks `10/10` |
| --- | --- | --- | --- |
| `mobile-critical-path.yaml` | `8/10` | Lane has been rewritten around current shell, Activity, profile, and chats selectors, now shares the common shell-boot subflow, and boots cleanly against a working `localhost:8090` Expo server | Still blocked by the Expo tools sheet hijacking the Activity -> Home return step during long local runs |
| `mobile-design-mock.yaml` | `7/10` | Static mock lane exists | Not a real product confidence gate |
| `mobile-profile-persistence.yaml` | `6/10` | Stable booted lane exists | Expo Go boot is still too noisy to make this our best proof lane |
| `mobile-settings-persistence.yaml` | `6/10` | Stable booted lane exists | Same boot issue as above |
| `mobile-chats-core.yaml` | `6/10` | Stable booted lane exists | Same boot issue as above |
| `mobile-profile-persistence-current.yaml` | `9/10` | Passed locally on 2026-04-19 through bio + interests save assertions | Needs preferences and reopen proof to claim complete persistence coverage |
| `mobile-profile-preferences-current.yaml` | `10/10` | Passed locally on 2026-04-20 through mode + notification save and exit assertion, with reopen persistence now proven by the companion lane | None on the current local MVP scope |
| `mobile-profile-preferences-reopen-current.yaml` | `10/10` | Passed locally on 2026-04-22 through save + reopen persistence on the stabilized `localhost:8090` Expo path | None on the current local MVP scope |
| `mobile-settings-persistence-current.yaml` | `9/10` | Passed locally on 2026-04-19 through save + protocol panel assertion | Needs reopen assertion to hit full persistence confidence |
| `mobile-settings-reopen-current.yaml` | `9/10` | Passed locally on 2026-04-20 through save + close + reopen assertions | Needs non-E2E-network coverage for full release confidence |
| `mobile-chats-core-current.yaml` | `8/10` | Passed locally on 2026-04-19 through `chats-screen` and empty-state assertion | Needs seeded-thread coverage for message composer/thread detail confidence |
| `mobile-chats-thread-current.yaml` | `9/10` | Passed locally on 2026-04-20 through seeded selected-thread + thread modal assertions | Needs reply/edit mutation coverage |
| `mobile-chats-mutations-current.yaml` | `9/10` | Passed locally on 2026-04-21 through injected-session boot, seeded thread open, edit, reaction, and delete assertions | Still depends on Expo Go plus injected-session boot rather than a cleaner dev-build lane |
| `mobile-notifications-entry-current.yaml` | `8/10` | Passed locally on 2026-04-20 through shell bell -> Activity assertion | Needs unread-state and return-path coverage |
| `mobile-notifications-roundtrip-current.yaml` | `9/10` | Passed locally on 2026-04-20 through shell bell -> Activity -> close -> shell assertion | Needs unread-state coverage |
| `mobile-other-profile-current.yaml` | `8/10` | Passed locally on 2026-04-20 through peer-profile open + close assertion | Needs non-E2E-source traversal coverage |
| Expo Go local boot | `8/10` | Shared shell-boot subflow exists, Maestro defaults now point at `exp://localhost:8090`, and the local Expo server is now running reliably on that port for cold starts | Still sensitive to the Expo tools overlay during longer multi-step runs |
| Selector coverage | `9/10` | Major weak surfaces now have stable ids and current-state flows | Needs more breadth on thread-modal and media-update surfaces |
| Surface scoring honesty | `9/10` | This doc now reflects real local Maestro reruns for Settings, Profile, and Chats | Needs continued refresh as more lanes land |

## Foundations

| Area | Readiness | Evidence | What still blocks `10/10` |
| --- | --- | --- | --- |
| App shell + tabs | `9/10` | Stable `app-bottom-tab-*` ids plus transient-safe E2E rail recovery are in place | Still needs a full route-graph proof |
| React Native ergonomics | `8/10` | Existing shell/components already structured cleanly | Needs continued reduction of Maestro-specific drift |
| Screen-level selector contract | `9/10` | Profile/settings/chats selectors plus transient recovery are in place | Needs completion across notifications and some utility surfaces |
| Maestro maintainability | `8/10` | Current-state recovery now handles overlays, transient closes, and shell fallback | Still needs one shared recovery helper for every lane |
| Readiness governance | `9/10` | Surface-by-surface scorecard now reflects live local evidence | Needs continuous evidence refresh |

## Current Headline

- Strongest surfaces right now: Home shell, Profile persistence/preferences, Settings shell/persistence, Chats thread shell
- Most improved this pass: Seeded chats/thread modal, settings reopen persistence, and notifications roundtrip
- Biggest blockers to `10/10` everywhere:
  - the Expo tools sheet can still hijack later return steps during longer current-state lanes
  - under-audited secondary surfaces like media update and unread-state notifications
  - too much remaining dependence on Expo Go instead of a cleaner dedicated dev-build lane
