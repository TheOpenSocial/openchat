"use client";

import { Check, ChevronDown, Globe2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  publicLocaleControlLabels,
  publicLocaleLabels,
  publicLocales,
  type PublicLocale,
} from "./public-locale";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function PublicLocaleSwitcher({ locale }: { locale: PublicLocale }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && !rootRef.current?.contains(target)) {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const setLocale = (nextLocale: PublicLocale) => {
    if (nextLocale === locale) {
      setOpen(false);
      return;
    }

    document.cookie = `opensocial-public-locale=${nextLocale};path=/;max-age=${COOKIE_MAX_AGE};samesite=lax`;
    window.localStorage.setItem("opensocial.web.locale", nextLocale);
    setOpen(false);
    window.location.reload();
  };

  return (
    <div
      aria-label={publicLocaleControlLabels[locale]}
      className="public-locale-switcher"
      ref={rootRef}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
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
        <span className="public-locale-current">{locale.toUpperCase()}</span>
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
              onPointerDown={(event) => {
                event.preventDefault();
                setLocale(option);
              }}
              role="menuitemradio"
              type="button"
            >
              <span>{publicLocaleLabels[option]}</span>
              <span aria-hidden="true" className="public-locale-option-code">
                {locale === option ? (
                  <Check size={15} strokeWidth={2.25} />
                ) : (
                  option.toUpperCase()
                )}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
