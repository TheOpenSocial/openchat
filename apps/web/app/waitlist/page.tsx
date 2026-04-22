import type { Metadata } from "next";
import { cookies } from "next/headers";

import {
  WaitlistPage,
  isWaitlistLocale,
  type WaitlistLocale,
} from "@/src/features/auth/waitlist-page";

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
  const params = searchParams ? await searchParams : undefined;
  const storedTheme = cookieStore.get("opensocial-public-theme")?.value;
  const storedLocale = cookieStore.get("opensocial-public-locale")?.value;
  const searchLocale = Array.isArray(params?.lang)
    ? params?.lang[0]
    : params?.lang;
  const initialTheme = storedTheme === "light" ? "light" : "dark";
  const initialLocale: WaitlistLocale = isWaitlistLocale(searchLocale)
    ? searchLocale
    : isWaitlistLocale(storedLocale)
      ? storedLocale
      : "en";

  return (
    <WaitlistPage initialLocale={initialLocale} initialTheme={initialTheme} />
  );
}
