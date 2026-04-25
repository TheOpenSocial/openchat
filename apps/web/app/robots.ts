import type { MetadataRoute } from "next";

import { siteConfig } from "@/src/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/manifesto", "/waitlist", "/video"],
        disallow: [
          "/activity",
          "/automations",
          "/auth",
          "/chats",
          "/circles",
          "/connections",
          "/discover",
          "/home",
          "/onboarding",
          "/profile",
          "/requests",
          "/saved-searches",
          "/scheduled-tasks",
          "/settings",
        ],
      },
    ],
    sitemap: `${siteConfig.url}/sitemap.xml`,
    host: siteConfig.url,
  };
}
