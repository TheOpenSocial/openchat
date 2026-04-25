import type { MetadataRoute } from "next";

import { privateRoutePrefixes, publicRoutes, siteConfig } from "@/src/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: publicRoutes.map((route) => route.path),
        disallow: [...privateRoutePrefixes],
      },
    ],
    sitemap: `${siteConfig.url}/sitemap.xml`,
    host: siteConfig.url,
  };
}
