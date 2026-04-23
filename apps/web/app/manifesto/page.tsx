import type { Metadata } from "next";
import { cookies, headers } from "next/headers";

import { ManifestoPage } from "@/src/features/auth/manifesto-page";
import { resolvePublicLocale } from "@/src/features/auth/public-locale";

export const metadata: Metadata = {
  title: "Manifesto | OpenSocial",
  description:
    "Why OpenSocial believes social software should begin with intent, consent, and real human connection.",
};

export default async function ManifestoRoute({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const params = searchParams ? await searchParams : undefined;
  const stored = cookieStore.get("opensocial-public-theme")?.value;
  const storedLocale = cookieStore.get("opensocial-public-locale")?.value;
  const initialTheme = stored === "light" ? "light" : "dark"; // default dark
  const searchLocale = Array.isArray(params?.lang)
    ? params?.lang[0]
    : params?.lang;
  const initialLocale = resolvePublicLocale({
    acceptLanguage: headerStore.get("accept-language"),
    searchLocale,
    storedLocale,
  });
  return (
    <ManifestoPage initialLocale={initialLocale} initialTheme={initialTheme} />
  );
}
