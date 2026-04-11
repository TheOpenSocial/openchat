# Frontend critical-path automation

This doc ties together **mobile** and **web** browser automation for milestone `24.3` (slim client: Home, Chats, Profile).

## Mobile (Maestro)

- Flow file: `apps/mobile/.maestro/mobile-critical-path.yaml`
- Daily-loop shell flow: `apps/mobile/.maestro/mobile-daily-loop.yaml`
- Design preview: `apps/mobile/.maestro/mobile-design-mock.yaml`
- Requires a running Expo app; for deterministic auth without Google, use:
  - `EXPO_PUBLIC_ENABLE_E2E_AUTH_BYPASS=1`
  - `EXPO_PUBLIC_ENABLE_E2E_LOCAL_MODE=1` (local chat / intent path without backend)
  - or `EXPO_PUBLIC_E2E_SESSION_B64=<base64 StoredSession>` for staging-backed runs

Run (from `apps/mobile`):

```bash
pnpm test:e2e:maestro
pnpm test:e2e:maestro:daily-loop

Staging-backed daily-loop run:

```bash
PLAYGROUND_BASE_URL=https://api.opensocial.so \
PLAYGROUND_ADMIN_USER_ID=... \
PLAYGROUND_ADMIN_API_KEY=... \
EXPO_PUBLIC_E2E_SESSION_B64=... \
pnpm test:mobile:daily-loop:staging -- --scenario=baseline
```
```

## Web (Playwright, design mock — no API)

Uses `NEXT_PUBLIC_DESIGN_MOCK=1` and stable `data-testid` hooks in `WebDesignMockApp`.

- Spec: `apps/web/e2e/design-mock-critical-path.spec.ts`
- Config: `apps/web/playwright.config.ts`

One-time browser install:

```bash
pnpm --filter @opensocial/web test:e2e:install
```

Run:

```bash
pnpm --filter @opensocial/web test:e2e
```

CI runs this suite on every push/PR (see `.github/workflows/ci.yml`).

## Optional next step: live API web E2E

A future improvement is Playwright (or similar) against **staging** with:

- API + DB seeded
- Demo auth codes or test-only OAuth bypass
- Assertions on real `POST /api/intents` and chat sync

That is **not** required for the current design-mock gate.
