import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";

const HOME_WELCOME_SHEET_STORAGE_KEY_PREFIX =
  "opensocial.mobile.home.welcome-sheet.v1";

function homeWelcomeSheetStorageKey(userId: string) {
  return `${HOME_WELCOME_SHEET_STORAGE_KEY_PREFIX}.${userId}`;
}

type UseHomeWelcomeSheetInput = {
  userId: string;
};

export function useHomeWelcomeSheet({ userId }: UseHomeWelcomeSheetInput) {
  const [visible, setVisible] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let mounted = true;

    AsyncStorage.getItem(homeWelcomeSheetStorageKey(userId))
      .then((stored) => {
        if (!mounted) {
          return;
        }
        setVisible(stored !== "dismissed");
        setHydrated(true);
      })
      .catch(() => {
        if (!mounted) {
          return;
        }
        setVisible(true);
        setHydrated(true);
      });

    return () => {
      mounted = false;
    };
  }, [userId]);

  const dismiss = () => {
    setVisible(false);
    AsyncStorage.setItem(homeWelcomeSheetStorageKey(userId), "dismissed").catch(
      () => {},
    );
  };

  return {
    dismiss,
    hydrated,
    visible,
  };
}
