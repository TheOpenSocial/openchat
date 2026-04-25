import type { Metadata } from "next";

const DEFAULT_SITE_URL = "https://opensocial.so";

export const siteConfig = {
  name: "OpenSocial",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? DEFAULT_SITE_URL,
  title: "OpenSocial | Intent-first social coordination",
  description:
    "OpenSocial helps people turn clear intent into real human connection with consent, context, safety, and speed.",
  creator: "OpenSocial",
  keywords: [
    "OpenSocial",
    "social coordination",
    "intent-first social network",
    "agentic social graph",
    "human connection",
    "social software",
  ],
} as const;

export const siteUrl = new URL(siteConfig.url);

export const publicRoutes = [
  {
    path: "/",
    priority: 1,
    changeFrequency: "weekly",
    lastModified: "2026-04-25",
  },
  {
    path: "/manifesto",
    priority: 0.86,
    changeFrequency: "monthly",
    lastModified: "2026-04-25",
  },
  {
    path: "/waitlist",
    priority: 0.92,
    changeFrequency: "monthly",
    lastModified: "2026-04-25",
  },
  {
    path: "/privacy",
    priority: 0.42,
    changeFrequency: "yearly",
    lastModified: "2026-04-25",
  },
  {
    path: "/terms",
    priority: 0.42,
    changeFrequency: "yearly",
    lastModified: "2026-04-25",
  },
  {
    path: "/security",
    priority: 0.48,
    changeFrequency: "yearly",
    lastModified: "2026-04-25",
  },
] as const;

export const privateRoutePrefixes = [
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
] as const;

type PublicMetadataOptions = {
  title?: string;
  description?: string;
  path?: string;
  images?: NonNullable<Metadata["openGraph"]>["images"];
};

export function createPublicMetadata({
  title = siteConfig.title,
  description = siteConfig.description,
  path = "/",
  images = [
    {
      url: "/opengraph-image",
      width: 1200,
      height: 630,
      alt: "OpenSocial",
    },
  ],
}: PublicMetadataOptions = {}): Metadata {
  const canonical = new URL(path, siteUrl);
  const pageTitle =
    title === siteConfig.name || title.startsWith("OpenSocial")
      ? title
      : `${title} | OpenSocial`;

  return {
    title: pageTitle,
    description,
    keywords: [...siteConfig.keywords],
    alternates: {
      canonical,
    },
    openGraph: {
      title: pageTitle,
      description,
      url: canonical,
      siteName: siteConfig.name,
      images,
      locale: "en_US",
      alternateLocale: ["es_ES", "fr_FR"],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: pageTitle,
      description,
      images: ["/opengraph-image"],
      creator: "@opensocial",
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
  };
}

export const hiddenPublicMetadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

export const privateMetadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

export function createOrganizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: siteConfig.name,
    url: siteConfig.url,
    logo: new URL("/icon.png", siteUrl).toString(),
    description: siteConfig.description,
  };
}

export function createWebsiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: siteConfig.name,
    url: siteConfig.url,
    description: siteConfig.description,
    inLanguage: ["en", "es", "fr"],
    potentialAction: {
      "@type": "RegisterAction",
      target: new URL("/waitlist", siteUrl).toString(),
      name: "Join the OpenSocial waitlist",
    },
  };
}

export function createSoftwareApplicationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: siteConfig.name,
    applicationCategory: "SocialNetworkingApplication",
    operatingSystem: "Web, iOS, Android",
    url: siteConfig.url,
    description: siteConfig.description,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      availability: "https://schema.org/PreOrder",
      url: new URL("/waitlist", siteUrl).toString(),
    },
  };
}
