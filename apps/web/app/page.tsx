import type { Metadata } from "next";
import { cookies, headers } from "next/headers";

import { WebDesignMockApp } from "@/src/WebDesignMockApp";
import { LandingScreen } from "@/src/features/auth/landing-screen";
import { resolvePublicLocale } from "@/src/features/auth/public-locale";
import { webEnv } from "@/src/lib/env";
import { createPublicMetadata } from "@/src/lib/seo";

export const metadata: Metadata = createPublicMetadata({
  title: "OpenSocial | Intent-first social coordination",
  description:
    "OpenSocial helps people express what they want, find the right people, and move toward genuine human connection.",
  path: "/",
});

export default async function RootPage() {
  if (webEnv.designMock) {
    return <WebDesignMockApp />;
  }

  const cookieStore = await cookies();
  const headerStore = await headers();
  const storedLocale = cookieStore.get("opensocial-public-locale")?.value;
  const initialLocale = resolvePublicLocale({
    acceptLanguage: headerStore.get("accept-language"),
    storedLocale,
  });

  return <LandingScreen initialLocale={initialLocale} />;
}
