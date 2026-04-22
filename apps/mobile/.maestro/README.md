# Maestro Mobile E2E

See also `docs/frontend-critical-path.md` for the combined mobile + web automation picture.

## Prerequisites
- iOS Simulator booted
- app started with E2E bypass + local mode enabled (backend-independent run):

```bash
EXPO_PUBLIC_ENABLE_E2E_AUTH_BYPASS=1 EXPO_PUBLIC_ENABLE_E2E_LOCAL_MODE=1 pnpm --filter @opensocial/mobile dev -- --ios
```

Optional backend-integrated run:

```bash
EXPO_PUBLIC_ENABLE_E2E_AUTH_BYPASS=1 EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:3000/api pnpm --filter @opensocial/mobile dev -- --ios
```

## Run critical-path flow

For Expo Go:

```bash
MAESTRO_APP_ID=host.exp.Exponent maestro test apps/mobile/.maestro/mobile-critical-path.yaml
```

For a native app build:

```bash
MAESTRO_APP_ID=com.opensocial.app maestro test apps/mobile/.maestro/mobile-critical-path.yaml
```

## Design mock flow (no API)

Start Metro with static preview mode:

```bash
EXPO_PUBLIC_DESIGN_MOCK=1 pnpm --filter @opensocial/mobile dev -- --ios
```

Run:

```bash
MAESTRO_APP_ID=host.exp.Exponent MAESTRO_EXPO_URL=exp://127.0.0.1:8081 maestro test apps/mobile/.maestro/mobile-design-mock.yaml
```

Adjust `MAESTRO_EXPO_URL` to match your Expo dev server.

Verified locally (2026-03-20): `mobile-critical-path.yaml` passes against Expo Go on the iOS Simulator when Metro runs with the E2E env vars above; `mobile-design-mock.yaml` passes with `EXPO_PUBLIC_DESIGN_MOCK=1` on the same port.

## Focused surface lanes

These flows audit specific mobile surfaces with more stable selectors than the older broad path:

```bash
MAESTRO_APP_ID=host.exp.Exponent MAESTRO_EXPO_URL=exp://127.0.0.1:8090 maestro test apps/mobile/.maestro/mobile-profile-persistence.yaml
MAESTRO_APP_ID=host.exp.Exponent MAESTRO_EXPO_URL=exp://127.0.0.1:8090 maestro test apps/mobile/.maestro/mobile-settings-persistence.yaml
MAESTRO_APP_ID=host.exp.Exponent MAESTRO_EXPO_URL=exp://127.0.0.1:8090 maestro test apps/mobile/.maestro/mobile-chats-core.yaml
```

These are meant to prove:
- `mobile-profile-persistence.yaml`: profile edits save and remain visible in-session
- `mobile-settings-persistence.yaml`: settings name edits save and protocol panel renders
- `mobile-chats-core.yaml`: chats surface opens and thread composer controls render when a chat exists

When Expo Go is already attached to a live project and sitting in Home, use the `*-current.yaml` variants for faster local iteration:

```bash
MAESTRO_APP_ID=host.exp.Exponent maestro test apps/mobile/.maestro/mobile-profile-persistence-current.yaml
MAESTRO_APP_ID=host.exp.Exponent maestro test apps/mobile/.maestro/mobile-profile-preferences-current.yaml
MAESTRO_APP_ID=host.exp.Exponent maestro test apps/mobile/.maestro/mobile-profile-preferences-reopen-current.yaml
MAESTRO_APP_ID=host.exp.Exponent maestro test apps/mobile/.maestro/mobile-settings-persistence-current.yaml
MAESTRO_APP_ID=host.exp.Exponent maestro test apps/mobile/.maestro/mobile-settings-reopen-current.yaml
MAESTRO_APP_ID=host.exp.Exponent maestro test apps/mobile/.maestro/mobile-chats-core-current.yaml
MAESTRO_APP_ID=host.exp.Exponent maestro test apps/mobile/.maestro/mobile-chats-thread-current.yaml
MAESTRO_APP_ID=host.exp.Exponent maestro test apps/mobile/.maestro/mobile-chats-mutations-current.yaml
MAESTRO_APP_ID=host.exp.Exponent maestro test apps/mobile/.maestro/mobile-notifications-entry-current.yaml
MAESTRO_APP_ID=host.exp.Exponent maestro test apps/mobile/.maestro/mobile-notifications-roundtrip-current.yaml
MAESTRO_APP_ID=host.exp.Exponent maestro test apps/mobile/.maestro/mobile-other-profile-current.yaml
```

These currently prove:
- `mobile-profile-persistence-current.yaml`: profile bio/location/interests edits save and remain visible in-session
- `mobile-profile-preferences-current.yaml`: match preferences opens, saves, and exits back to shell state
- `mobile-profile-preferences-reopen-current.yaml`: match preferences survive a close/reopen cycle in-session
- `mobile-settings-persistence-current.yaml`: settings identity edits save and the protocol panel remains available
- `mobile-settings-reopen-current.yaml`: settings identity edits survive a close/reopen cycle in-session
- `mobile-chats-core-current.yaml`: chats surface opens reliably and honors the empty-state contract when no seeded thread exists
- `mobile-chats-thread-current.yaml`: seeded local chat fixture proves selected-thread composer and thread modal behavior
- `mobile-chats-mutations-current.yaml`: seeded local chat fixture proves edit, reaction, and delete flows in-session
- `mobile-notifications-entry-current.yaml`: shell notifications button routes into Activity
- `mobile-notifications-roundtrip-current.yaml`: notifications entry returns cleanly to the shell after Activity close
- `mobile-other-profile-current.yaml`: E2E peer-profile traversal opens and closes a real other-profile surface
