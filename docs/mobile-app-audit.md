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
| Add transient-safe E2E rail recovery | `done` | E2E rail now renders over transient routes too |
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
| Repair stale legacy critical-path ids | `done` | Critical path has been rewritten around current shell/activity/profile/chats selectors |
| Add focused lane for chat edit/reaction/delete mutations | `done` | Current-state mutation lane added for seeded local thread proof |
| Add dev-only local auth bypass for current-state mobile lanes | `done` | `auth-e2e-bypass-button` now exists and routes through a local session shortcut |
| Add persisted-reopen lane for profile preferences | `done` | Current-state local lane now passes through save + reopen persistence on the stabilized `localhost:8090` Expo path |
| Add focused lane for photo-update fallback | `next` | Needs E2E-safe strategy |
| Add route-graph audit lane for mobile shell | `next` | Needed for broader confidence |
| Replace brittle point taps where route ids exist | `in_progress` | Focused lanes already improved, legacy lane still stale |
| Dismiss Expo Go tools overlay in current-state flows | `done` | Current-state flows now begin by closing the tools sheet |
| Tighten onboarding completion coverage | `next` | Landing is preserved, path needs stronger proof |
| Tighten Home recovery/empty states coverage | `next` | Existing UI stronger than automation proof |
| Stabilize current-state auth-to-home handoff in Expo Go | `done` | Mutation lane now passes on the injected-session Expo Go path instead of depending on the local bypass tap |
| Stabilize Expo Go against stale localhost project fallback | `done` | Shared shell-boot subflow exists, Maestro defaults now point at `exp://localhost:8090`, and the local Expo server is dependable on that port |
| Dismiss Expo tools sheet during long critical-path returns | `in_progress` | Critical path now reaches Activity cleanly, but the Expo tools overlay can still hijack the Activity -> Home return step |
| Tighten notifications shell coverage | `in_progress` | Entry and roundtrip are proven; unread-state coverage still missing |
| Refresh readiness scores from real reruns | `done` | Settings, Profile, Chats thread, and chat mutation current-state lanes now reflected in the matrix |

## Source Of Truth

Use [docs/mobile-readiness-matrix.md](/Users/cruciblelabs/.codex/worktrees/189c/openchat/docs/mobile-readiness-matrix.md) for current numeric readiness scores.
