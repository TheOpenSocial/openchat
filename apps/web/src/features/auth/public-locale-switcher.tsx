"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  publicLocaleControlLabels,
  publicLocaleLabels,
  publicLocales,
  type PublicLocale,
} from "./public-locale";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function PublicLocaleSwitcher({ locale }: { locale: PublicLocale }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const setLocale = (nextLocale: PublicLocale) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("lang", nextLocale);
    document.cookie = `opensocial-public-locale=${nextLocale};path=/;max-age=${COOKIE_MAX_AGE};samesite=lax`;
    window.localStorage.setItem("opensocial.web.locale", nextLocale);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <div
      aria-label={publicLocaleControlLabels[locale]}
      className="public-locale-switcher"
      role="group"
    >
      {publicLocales.map((option) => (
        <button
          aria-pressed={locale === option}
          className={`public-locale-option${
            locale === option ? " public-locale-option--active" : ""
          }`}
          key={option}
          onClick={() => setLocale(option)}
          type="button"
        >
          {publicLocaleLabels[option]}
        </button>
      ))}
    </div>
  );
}
