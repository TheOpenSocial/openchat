"use client";

import { ChevronDown, Globe2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  publicLocaleControlLabels,
  publicLocaleLabels,
  publicLocales,
  type PublicLocale,
} from "./public-locale";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function PublicLocaleSwitcher({ locale }: { locale: PublicLocale }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const setLocale = (nextLocale: PublicLocale) => {
    document.cookie = `opensocial-public-locale=${nextLocale};path=/;max-age=${COOKIE_MAX_AGE};samesite=lax`;
    window.localStorage.setItem("opensocial.web.locale", nextLocale);
    setOpen(false);
    router.refresh();
  };

  return (
    <div
      aria-label={publicLocaleControlLabels[locale]}
      className="public-locale-switcher"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setOpen(false);
        }
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
        }
      }}
    >
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={publicLocaleControlLabels[locale]}
        className="public-locale-trigger"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <Globe2 aria-hidden="true" size={17} strokeWidth={2} />
        <ChevronDown aria-hidden="true" size={14} strokeWidth={2} />
      </button>

      {open ? (
        <div className="public-locale-menu" role="menu">
          {publicLocales.map((option) => (
            <button
              aria-checked={locale === option}
              className={`public-locale-option${
                locale === option ? " public-locale-option--active" : ""
              }`}
              key={option}
              onClick={() => setLocale(option)}
              role="menuitemradio"
              type="button"
            >
              <span>{publicLocaleLabels[option]}</span>
              <span aria-hidden="true">{option.toUpperCase()}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
