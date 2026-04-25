import type { MetadataRoute } from "next";

import { publicRoutes, siteUrl } from "@/src/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  return publicRoutes.map((route) => ({
    url: new URL(route.path, siteUrl).toString(),
    lastModified: new Date(route.lastModified),
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
