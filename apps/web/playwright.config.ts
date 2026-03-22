import { defineConfig, devices } from "@playwright/test";

/**
 * Design-mock E2E: no API required (`NEXT_PUBLIC_DESIGN_MOCK=1`).
 * Run from repo root: `pnpm --filter @opensocial/web test:e2e`
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3002",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command:
      "NEXT_PUBLIC_DESIGN_MOCK=1 pnpm exec next build && NEXT_PUBLIC_DESIGN_MOCK=1 pnpm exec next start -p 3002 -H 127.0.0.1",
    cwd: __dirname,
    url: "http://127.0.0.1:3002",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
