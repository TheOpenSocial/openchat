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
