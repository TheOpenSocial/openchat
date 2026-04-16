# Local Setup Guide

## Prerequisites
- Node.js 22+
- pnpm 10+
- Docker Desktop

## Brand assets (logo, app icons, splash)

- **Source SVG:** `packages/brand/assets/logo.svg`
- **Regenerate** PNGs and copies for mobile + web + admin:

```bash
pnpm brand:generate
```

Commit the generated files under `apps/mobile/assets`, `apps/web/public/brand`, `apps/web/app/icon.png`, etc., so CI and EAS builds do not need to run the script.

## Setup
1. Install dependencies.

```bash
pnpm install
```

2. Start local services.

```bash
pnpm db:up
```

3. Generate Prisma client.

```bash
pnpm db:generate
```

4. Apply migrations.

```bash
pnpm db:migrate
```

5. Seed local data (optional but recommended).

```bash
pnpm db:seed
```

6. Start all apps/services.

```bash
pnpm dev
```

## Verification
Run from repo root:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm db:drift-check
```

**Web UI automation (no backend):** after `pnpm --filter @opensocial/web test:e2e:install` once:

```bash
pnpm --filter @opensocial/web test:e2e
```

See `docs/frontend-critical-path.md` for Maestro + Playwright details.

## URLs
- API health: `http://localhost:3000/health`
- Shared production API (default for shipped web + mobile clients): `https://api.opensocial.so`
- Admin app: default Next.js dev port for `apps/admin`
- Mobile: run with `pnpm --filter @opensocial/mobile dev`
- Web: `pnpm --filter @opensocial/web dev` (port `3002` by default)

### Web Google sign-in (local)
- In [Google Cloud Console](https://console.cloud.google.com/), OAuth **Authorized redirect URI** must include your API callback, e.g. `http://localhost:3000/auth/google/callback` (`GOOGLE_REDIRECT_URI`).
- The web app starts OAuth with `webRedirectUri` pointing at `http://localhost:3002/auth/callback` (or your dev origin); the API validates that path and redirects back with `?code=…`.
- Staging/production: set **`WEB_APP_REDIRECT_URIS`** to the full web callback URL(s), comma-separated (same pattern as `ADMIN_DASHBOARD_REDIRECT_URIS`).

### Mobile + Google (production API)

- OAuth is **browser → API → deep link back to app**; see **`docs/mobile-google-signin.md`**.
- **Google Cloud:** one **Web** OAuth client; redirect URI = **`{API origin}/auth/google/callback`** only.
- **App → API:** defaults target **`https://api.opensocial.so`**; for a **local** API use `EXPO_PUBLIC_API_BASE_URL` or `EXPO_PUBLIC_USE_LOCAL_API=1` (see root `.env.example`).

## iOS real device (mobile)
- This repo uses Expo managed workflow, so `apps/mobile/ios` is generated only when needed.
- Generate the iOS native project: `pnpm --filter @opensocial/mobile prebuild:ios`
- Open `apps/mobile/ios/*.xcworkspace` in Xcode.
- In **Signing & Capabilities**, select your Apple Team and unique bundle identifier.
- Deploy to a connected device: `pnpm --filter @opensocial/mobile run:ios:device`

### `pnpm jarvis` (named device + Metro)

From the repo root, `pnpm jarvis` runs `scripts/jarvis-ios.sh`: **prebuild**, starts **Expo Metro** in the background, waits until `http://127.0.0.1:8081/status` is healthy, then **`expo run:ios --no-bundler`** to the device named **Jarvis mobile** (override with `JARVIS_IOS_DEVICE="Your iPhone"`). This avoids the case where `expo run:ios` alone—especially under `pnpm`—does not leave Metro running visibly or at all.

If you prefer two terminals: Terminal A `pnpm --filter @opensocial/mobile dev`, Terminal B `pnpm --filter @opensocial/mobile exec expo run:ios --device "Jarvis mobile" --no-bundler`.

## UI design preview (no backend)

- **Mobile:** `EXPO_PUBLIC_DESIGN_MOCK=1 pnpm --filter @opensocial/mobile dev` — full tabbed shell with mock home (agent chat), chats, and profile data.
- **Web:** `NEXT_PUBLIC_DESIGN_MOCK=1 pnpm --filter @opensocial/web dev` — same idea in the browser (welcome → preview sign-in → onboarding → home).
