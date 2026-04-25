import type { Metadata } from "next";
import { Space_Grotesk, Source_Sans_3 } from "next/font/google";
import { cookies, headers } from "next/headers";
import type { ReactNode } from "react";

import { SeoJsonLd } from "@/src/components/SeoJsonLd";
import { AppSessionProvider } from "@/src/features/app-shell/app-session";
import { resolvePublicLocale } from "@/src/features/auth/public-locale";
import { createPublicMetadata, siteConfig, siteUrl } from "@/src/lib/seo";

import "./globals.css";

const headingFont = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-heading",
  display: "swap",
});

const bodyFont = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: siteUrl,
  applicationName: siteConfig.name,
  authors: [{ name: siteConfig.name, url: siteUrl }],
  generator: "Next.js",
  referrer: "origin-when-cross-origin",
  category: "technology",
  ...createPublicMetadata(),
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon.png", sizes: "512x512", type: "image/png" },
      { url: "/brand/logo.svg", type: "image/svg+xml" },
    ],
    shortcut: "/icon.png",
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
  manifest: "/manifest.webmanifest",
};

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const storedLocale = cookieStore.get("opensocial-public-locale")?.value;
  const lang = resolvePublicLocale({
    acceptLanguage: headerStore.get("accept-language"),
    storedLocale,
  });

  return (
    <html
      className={`${headingFont.variable} ${bodyFont.variable}`}
      lang={lang}
    >
      <body className="font-[var(--font-body)] text-ink antialiased">
        <SeoJsonLd />
        <AppSessionProvider>{children}</AppSessionProvider>
      </body>
    </html>
  );
}
