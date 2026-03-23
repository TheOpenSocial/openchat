import { useEffect, useState } from "react";

import { waitForNativeRuntimeReady } from "./native-runtime-ready";

/**
 * Tracks device connectivity. When `skip` is true (e.g. design mock), always reports online.
 */
export function useNetworkOnline(skip: boolean): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    if (skip) {
      return;
    }

    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    void (async () => {
      try {
        await waitForNativeRuntimeReady();
        if (cancelled) {
          return;
        }
        const NetInfo =
          (await import("@react-native-community/netinfo")).default;

        const apply = (
          connected: boolean | null,
          reachable: boolean | null,
        ): void => {
          if (connected === false || reachable === false) {
            setOnline(false);
            return;
          }
          setOnline(true);
        };

        unsubscribe = NetInfo.addEventListener((state) => {
          apply(state.isConnected, state.isInternetReachable);
        });

        void NetInfo.fetch()
          .then((state) => {
            apply(state.isConnected, state.isInternetReachable);
          })
          .catch(() => {
            if (!cancelled) {
              setOnline(true);
            }
          });
      } catch {
        if (!cancelled) {
          // If the native NetInfo module is unavailable in this runtime, keep the UI usable.
          setOnline(true);
        }
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [skip]);

  return online;
}
