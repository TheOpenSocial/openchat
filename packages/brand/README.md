# OpenSocial brand assets

- **Source of truth:** `assets/logo.svg`
- **Regenerate rasters & copies:** from repo root run `pnpm brand:generate`

Outputs go to `apps/mobile/assets`, `apps/web/public/brand` + `apps/web/app` icons, and `apps/admin` the same way. Commit generated PNGs so EAS / Vercel builds do not need to run the script.
