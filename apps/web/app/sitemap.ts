import type { MetadataRoute } from "next";

import { siteUrl } from "@/src/lib/seo";

const publicRoutes = [
  { path: "/", priority: 1 },
  { path: "/manifesto", priority: 0.86 },
  { path: "/waitlist", priority: 0.92 },
  { path: "/video", priority: 0.5 },
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return publicRoutes.map((route) => ({
    url: new URL(route.path, siteUrl).toString(),
    lastModified: now,
    changeFrequency: route.path === "/" ? "weekly" : "monthly",
    priority: route.priority,
  }));
}
