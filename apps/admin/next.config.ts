import type { NextConfig } from "next";
import { readFileSync } from "node:fs";
import path from "node:path";

function normalizePath(input: string | undefined) {
  if (!input || input === "/") {
    return "/api";
  }
  return input.startsWith("/") ? input.replace(/\/+$/, "") : `/${input}`;
}

function normalizeOrigin(input: string | undefined) {
  if (!input) {
    return null;
  }
  try {
    const parsed = new URL(input);
    return `${parsed.protocol}//${parsed.host}`.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

function resolveApiBaseUrlFromSettings() {
  const settingsPath = path.resolve(process.cwd(), "..", "..", "settings.json");
  const rawSettings = readFileSync(settingsPath, "utf8");
  const settings = JSON.parse(rawSettings) as {
    defaultEnvironment?: string;
    environments?: Record<
      string,
      {
        domains?: {
          apiOrigin?: string;
        };
        apiBasePath?: string;
      }
    >;
  };

  const envName =
    process.env.OPENSOCIAL_ENV ??
    process.env.SETTINGS_ENV ??
    settings.defaultEnvironment ??
    (process.env.NODE_ENV === "production" ? "production" : "development");
  const envConfig = settings.environments?.[envName];
  const origin = normalizeOrigin(envConfig?.domains?.apiOrigin);
  if (!origin) {
    return "http://localhost:3000/api";
  }
  const apiBasePath = normalizePath(envConfig?.apiBasePath);
  return `${origin}${apiBasePath}`;
}

const configuredApiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? resolveApiBaseUrlFromSettings();

/**
 * Next.js 16+ uses **Turbopack** as the default bundler for `next dev` and `next build`.
 * Webpack is opt-in only (`next dev --webpack` / `next build --webpack`) — do not add a
 * custom `webpack()` config here; use the `turbopack` key if you need loaders or aliases.
 *
 * @see https://nextjs.org/docs/app/api-reference/turbopack
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ["127.0.0.1"],
  env: {
    NEXT_PUBLIC_API_BASE_URL: configuredApiBaseUrl,
  },
  experimental: {
    turbopackFileSystemCacheForBuild: true,
  },
};

export default nextConfig;
