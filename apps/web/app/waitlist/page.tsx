import type { Metadata } from "next";
import { cookies, headers } from "next/headers";

import { WaitlistPage } from "@/src/features/auth/waitlist-page";
import { resolvePublicLocale } from "@/src/features/auth/public-locale";
import { createPublicMetadata } from "@/src/lib/seo";

export const metadata: Metadata = createPublicMetadata({
  title: "Join the waitlist",
  description:
    "Join the OpenSocial waitlist for early access to intent-first social coordination.",
  path: "/waitlist",
});

export default async function WaitlistRoute() {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const storedTheme = cookieStore.get("opensocial-public-theme")?.value;
  const storedLocale = cookieStore.get("opensocial-public-locale")?.value;
  const initialTheme = storedTheme === "light" ? "light" : "dark";
  const initialLocale = resolvePublicLocale({
    acceptLanguage: headerStore.get("accept-language"),
    storedLocale,
  });

  return (
    <WaitlistPage initialLocale={initialLocale} initialTheme={initialTheme} />
  );
}
