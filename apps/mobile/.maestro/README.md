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
