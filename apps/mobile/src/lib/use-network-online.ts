import NetInfo from "@react-native-community/netinfo";
import { useEffect, useState } from "react";

/**
 * Tracks device connectivity. When `skip` is true (e.g. design mock), always reports online.
 */
export function useNetworkOnline(skip: boolean): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    if (skip) {
      return;
    }

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

    const unsubscribe = NetInfo.addEventListener((state) => {
      apply(state.isConnected, state.isInternetReachable);
    });

    void NetInfo.fetch().then((state) => {
      apply(state.isConnected, state.isInternetReachable);
    });

    return () => {
      unsubscribe();
    };
  }, [skip]);

  return online;
}
