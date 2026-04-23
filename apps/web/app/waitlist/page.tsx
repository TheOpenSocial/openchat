import type { Metadata } from "next";
import { cookies, headers } from "next/headers";

import { WaitlistPage } from "@/src/features/auth/waitlist-page";
import { resolvePublicLocale } from "@/src/features/auth/public-locale";

export const metadata: Metadata = {
  title: "Join Waitlist | OpenSocial",
  description: "Join the OpenSocial waitlist and hear when access opens.",
};

export default async function WaitlistRoute({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const params = searchParams ? await searchParams : undefined;
  const storedTheme = cookieStore.get("opensocial-public-theme")?.value;
  const storedLocale = cookieStore.get("opensocial-public-locale")?.value;
  const searchLocale = Array.isArray(params?.lang)
    ? params?.lang[0]
    : params?.lang;
  const initialTheme = storedTheme === "light" ? "light" : "dark";
  const initialLocale = resolvePublicLocale({
    acceptLanguage: headerStore.get("accept-language"),
    searchLocale,
    storedLocale,
  });

  return (
    <WaitlistPage initialLocale={initialLocale} initialTheme={initialTheme} />
  );
}
