"use client";

import { useEffect, useState } from "react";
import { type AppLocale, supportedLocales } from "../../lib/i18n";

const ADMIN_LOCALE_STORAGE_KEY = "opensocial.admin.locale.v1";

export function useAdminLocale(defaultLocale: AppLocale = "en") {
  const [locale, setLocale] = useState<AppLocale>(defaultLocale);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const stored = window.localStorage.getItem(ADMIN_LOCALE_STORAGE_KEY);
    if (stored && supportedLocales.includes(stored as AppLocale)) {
      setLocale(stored as AppLocale);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(ADMIN_LOCALE_STORAGE_KEY, locale);
  }, [locale]);

  return {
    locale,
    setLocale,
  };
}
