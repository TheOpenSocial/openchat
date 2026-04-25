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
