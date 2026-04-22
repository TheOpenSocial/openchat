# Maestro Mobile E2E

See also `docs/frontend-critical-path.md` for the combined mobile + web automation picture.

## Prerequisites
- iOS Simulator booted

## Backend-independent shell run

Start the app with E2E bypass + local mode:

```bash
EXPO_PUBLIC_ENABLE_E2E_AUTH_BYPASS=1 EXPO_PUBLIC_ENABLE_E2E_LOCAL_MODE=1 pnpm --filter @opensocial/mobile dev -- --ios
```

## Backend-integrated run

Start the app with an injected real session:

```bash
EXPO_PUBLIC_ENABLE_E2E_AUTH_BYPASS=1 \
EXPO_PUBLIC_E2E_SESSION_B64="<base64-encoded StoredSession JSON>" \
EXPO_PUBLIC_API_BASE_URL=https://api.opensocial.so \
pnpm --filter @opensocial/mobile dev -- --ios
```

For staging sandbox validation, set the scenario before running Maestro:

```bash
PLAYGROUND_BASE_URL=https://api.opensocial.so \
PLAYGROUND_ADMIN_USER_ID=... \
PLAYGROUND_ADMIN_API_KEY=... \
EXPO_PUBLIC_E2E_SESSION_B64=... \
pnpm test:mobile:daily-loop:staging -- --scenario=baseline
```

For a single API-backed mobile audit command, use:

```bash
pnpm test:mobile:sandbox:maestro -- --scenario=baseline --flow=sandbox-surface
```

That runner:

- prepares the named sandbox world scenario
- emits a real mobile session
- starts Expo with the injected session and API base URL
- runs Maestro against the native dev app
- asserts the `Home` and `Activity` content match the sandbox read model

It prefers local admin or smoke credentials when present, and falls back to the
GitHub staging workflows when they are not.

For the most reliable local Expo Go path, pre-attach the project and then run
the already-attached surface audit:

```bash
MAESTRO_APP_ID=host.exp.Exponent maestro test apps/mobile/.maestro/mobile-sandbox-surface-smoke-expo-go-attached.yaml
```

The attached Expo Go flows assume the injected E2E session is already
authenticated and onboarded. They intentionally skip first-run onboarding so
the local audit stays focused on post-auth product surfaces.

For a single Activity quick-link target in that same attached mode:

```bash
node scripts/run-mobile-sandbox-maestro.mjs \
  --scenario=baseline \
  --flow=activity-target \
  --app-id=host.exp.Exponent \
  --activity-target-id=activity-open-inbox \
  --activity-target-screen-id=inbox-screen \
  --activity-target-close-id=inbox-close
```

Current caveat:

- the scenario/session preparation path is reliable
- the remaining native red is the installed dev-client cold-launch handoff on
  iOS Simulator
- the current failure mode is `No script URL provided` before `home-screen`
  becomes visible
- for CI-grade reliability, prefer Expo Go or a hosted update-manifest path
  until native dev-client cold-launch is replaced

## Run critical-path flow

For Expo Go:

```bash
MAESTRO_APP_ID=host.exp.Exponent maestro test apps/mobile/.maestro/mobile-critical-path.yaml
```

For a native app build:

```bash
MAESTRO_APP_ID=com.opensocial.app maestro test apps/mobile/.maestro/mobile-critical-path.yaml
```

## Run route-graph flow

This is the broader mobile shell audit flow. It validates that the main
operational surfaces are actually reachable through the app graph:

- Home
- Activity
- Inbox
- Connections
- Discovery
- Recurring circles
- Saved searches
- Scheduled tasks
- Settings

For Expo Go:

```bash
MAESTRO_APP_ID=host.exp.Exponent maestro test apps/mobile/.maestro/mobile-route-graph.yaml
```

This route graph now includes:

- Home
- Profile
- Settings
- Activity
- Inbox
- Connections
- Discovery
- Recurring circles
- Saved searches
- Scheduled tasks

## Run surface-smoke flow

This is the release-grade mobile reachability lane. It boots fresh for each
major surface and verifies that the screen is actually reachable without relying
on close-transition timing:

- Settings
- Activity
- Inbox
- Connections
- Discovery
- Recurring circles
- Saved searches
- Scheduled tasks

For a native dev build:

```bash
MAESTRO_APP_ID=so.opensocial.app maestro test apps/mobile/.maestro/mobile-surface-smoke.yaml
```

## Run persistence and chat lanes

These are the next focused upgrade lanes for raising weaker surfaces toward
release-grade readiness:

```bash
pnpm --filter @opensocial/mobile test:e2e:maestro:profile-persistence
pnpm --filter @opensocial/mobile test:e2e:maestro:settings-persistence
pnpm --filter @opensocial/mobile test:e2e:maestro:chats-core
```

## Run sandbox-backed surface-smoke flow

This is the strongest mobile data-audit lane right now. It uses sandbox-world
API data instead of local fake data and asserts that the app renders the
scenario's `Home` and `Activity` state.

```bash
pnpm test:mobile:sandbox:maestro -- --scenario=waiting_replies --flow=sandbox-surface
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
