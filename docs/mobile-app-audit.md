# Mobile App Audit

This board tracks the mobile-only work needed to push the app to dependable, automation-backed quality.

Status legend:
- `done`
- `in_progress`
- `next`

## Execution Board

| Item | Status | Notes |
| --- | --- | --- |
| Add stable root selector for Profile | `done` | `profile-screen` added |
| Add stable root selector for Settings | `done` | `settings-screen` added |
| Add stable root selector for Chats | `done` | `chats-screen` added |
| Add stable root selector for Other Profile | `done` | `other-profile-screen` added |
| Add profile action selectors | `done` | Edit/preferences/interests/reset/photo/sign-out |
| Add profile bio persistence selectors | `done` | Bio/location inputs and save/cancel |
| Add profile interests persistence selectors | `done` | Interests input and save/cancel |
| Add profile preference selectors | `done` | Mode and notification chips plus save/cancel |
| Add settings identity selectors | `done` | First/last name inputs and save button |
| Add protocol panel selector | `done` | Panel root and refresh button |
| Add chats thread-list selectors | `done` | List root and first/dynamic rows |
| Add selected-thread selector | `done` | `chat-selected-thread` |
| Add chats moderation action selectors | `done` | View profile/report/block |
| Add chats reaction selectors | `done` | Per-message reaction ids |
| Add chats thread-open selector | `done` | Thread open button ids |
| Add chats edit/reply banner selectors | `done` | Edit and reply banners |
| Add chats thread-modal selectors | `done` | Modal root and close button |
| Create shared Maestro boot subflow | `done` | `subflows/boot-home-local.yaml` |
| Create profile persistence Maestro lane | `done` | New focused lane |
| Create settings persistence Maestro lane | `done` | New focused lane |
| Create chats core Maestro lane | `done` | New focused lane |
| Create current-state Maestro lanes | `done` | Added `*-current.yaml` flows for already-attached local iteration |
| Add transient-safe E2E rail recovery | `done` | E2E rail now renders as a top-layer overlay with deterministic current-route markers |
| Add package scripts for focused lanes | `done` | Mobile package updated |
| Update Maestro README with focused lanes | `done` | Usage documented |
| Create standalone readiness matrix doc | `done` | `docs/mobile-readiness-matrix.md` |
| Add Expo error overlay dismissal to current-state lanes | `done` | `Minimize` / `Dismiss` recovery added |
| Add E2E offline persistence fallback for profile | `done` | Current-state profile saves now resolve in injected-session local mode |
| Rerun profile persistence locally | `done` | Current-state local lane passed through bio + interests save assertions |
| Add focused lane for profile preferences | `done` | Current-state lane now proves mode + notification save and exit |
| Rerun settings persistence locally | `done` | Current-state local lane passed through save and protocol panel assertion |
| Add settings reopen verification lane | `done` | Current-state lane now proves save + close + reopen persistence |
| Rerun chats core locally | `done` | Current-state local lane passed through `chats-screen` and empty-state assertion |
| Add seeded chats/thread lane | `done` | Current-state lane now proves selected-thread composer and thread modal open/close |
| Add focused lane for notifications | `done` | Current-state lane now proves shell bell -> Activity entry |
| Add notifications roundtrip lane | `done` | Current-state lane now proves shell recovery after Activity close |
| Add focused lane for other-profile traversal | `done` | Current-state peer-profile lane now proves open + close |
| Repair stale legacy critical-path ids | `done` | Critical path passed locally on 2026-04-22 on the rewritten shell/activity/profile/chats path |
| Add focused lane for chat edit/reaction/delete mutations | `done` | Current-state mutation lane added for seeded local thread proof |
| Add dev-only local auth bypass for current-state mobile lanes | `done` | `auth-e2e-bypass-button` now exists and routes through a local session shortcut |
| Add persisted-reopen lane for profile preferences | `done` | Current-state local lane now passes through save + reopen persistence on the stabilized `localhost:8090` Expo path |
| Add focused lane for photo-update fallback | `done` | Current-state profile and settings photo lanes both passed locally on 2026-04-22 through the real avatar actions and update markers |
| Add route-graph audit lane for mobile shell | `done` | `mobile-route-graph.yaml` passed locally on 2026-04-23 through Home, Activity, Inbox, Connections, Discovery, Recurring circles, Saved searches, Scheduled tasks, Profile, and Settings |
| Replace brittle point taps where route ids exist | `in_progress` | Focused lanes already improved, legacy lane still stale |
| Dismiss Expo Go tools overlay in current-state flows | `done` | Current-state flows now begin by closing the tools sheet |
| Tighten onboarding completion coverage | `in_progress` | Real first-run lane now injects an incomplete E2E session, asserts onboarding, completes through the dev-only onboarding shortcut, and lands in Home; needs a local Maestro rerun before marking done |
| Add auth/onboarding/Home recovery promotion lane | `done` | `mobile-auth-onboarding-home-recovery.yaml` now proves incomplete-session onboarding, Home shell handoff, Activity hop, and Home recovery without SDK/backend changes |
| Tighten Home recovery/empty states coverage | `in_progress` | Recovery promotion lane exists; empty-state breadth still needs a local Maestro pass before this can be closed |
| Stabilize current-state auth-to-home handoff in Expo Go | `done` | Mutation lane now passes on the injected-session Expo Go path instead of depending on the local bypass tap |
| Stabilize Expo Go against stale localhost project fallback | `done` | Shared shell-boot subflow exists, Maestro defaults now point at `exp://localhost:8090`, and the local Expo server is dependable on that port |
| Dismiss Expo tools sheet during long critical-path returns | `done` | Current critical path now passes locally on 2026-04-22 on the shared shell-boot + E2E rail path |
| Tighten notifications shell coverage | `done` | Current-state unread and roundtrip lanes both passed locally on 2026-04-22 on the shared shell-boot path |
| Refresh readiness scores from real reruns | `done` | Settings, Profile, Chats thread, and chat mutation current-state lanes now reflected in the matrix |
| Collapse transient route state to one active route | `done` | Replaced competing fullscreen booleans with one explicit transient route so only one route can be active |

## Source Of Truth

Use [docs/mobile-readiness-matrix.md](/Users/cruciblelabs/Documents/openchat/docs/mobile-readiness-matrix.md) for current numeric readiness scores.
