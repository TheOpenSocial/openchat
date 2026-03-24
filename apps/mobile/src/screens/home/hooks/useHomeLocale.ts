import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";

import { type AppLocale, supportedLocales } from "../../../i18n/strings";

const MOBILE_LOCALE_STORAGE_KEY = "opensocial.mobile.locale.v1";

export function useHomeLocale(initialLocale: AppLocale = "en") {
  const [locale, setLocale] = useState<AppLocale>(initialLocale);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(MOBILE_LOCALE_STORAGE_KEY)
      .then((stored: string | null) => {
        if (
          mounted &&
          stored &&
          supportedLocales.includes(stored as AppLocale)
        ) {
          setLocale(stored as AppLocale);
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(MOBILE_LOCALE_STORAGE_KEY, locale).catch(() => {});
  }, [locale]);

  return { locale, setLocale };
}
