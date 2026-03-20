import type { NextConfig } from "next";

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
  experimental: {
    turbopackFileSystemCacheForBuild: true,
  },
};

export default nextConfig;
