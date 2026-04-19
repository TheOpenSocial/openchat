import { useEffect } from "react";
import { AppState, type AppStateStatus } from "react-native";
import {
  QueryClient,
  focusManager,
  onlineManager,
} from "@tanstack/react-query";

import { waitForNativeRuntimeReady } from "./native-runtime-ready";

let mobileQueryClientSingleton: QueryClient | null = null;

function createMobileQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: 1000 * 60 * 10,
        refetchOnMount: true,
        refetchOnReconnect: true,
        refetchOnWindowFocus: false,
        retry: 1,
        staleTime: 1000 * 20,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}

export function getMobileQueryClient() {
  if (!mobileQueryClientSingleton) {
    mobileQueryClientSingleton = createMobileQueryClient();
  }
  return mobileQueryClientSingleton;
}

export const mobileQueryKeys = {
  activitySummary: (userId: string) => ["mobile", "activity-summary", userId],
  activationBootstrap: (userId: string) => [
    "mobile",
    "activation-bootstrap",
    userId,
  ],
  activationPlan: (userId: string) => ["mobile", "activation-plan", userId],
  connections: (userId: string) => ["mobile", "connections", userId],
  discoveryFeed: (userId: string) => ["mobile", "discovery-feed", userId],
  inboxRequests: (userId: string) => ["mobile", "inbox-requests", userId],
  intentStatus: (userId: string, intentId: string) => [
    "mobile",
    "intent-status",
    userId,
    intentId,
  ],
  recurringCircles: (userId: string) => ["mobile", "recurring-circles", userId],
  savedSearches: (userId: string) => ["mobile", "saved-searches", userId],
  scheduledTasks: (userId: string) => ["mobile", "scheduled-tasks", userId],
} as const;

function setFocused(status: AppStateStatus) {
  focusManager.setFocused(status === "active");
}

export function useConfigureMobileQuery(skipNetwork = false) {
  useEffect(() => {
    const appStateSubscription = AppState.addEventListener(
      "change",
      setFocused,
    );
    setFocused(AppState.currentState);

    if (skipNetwork) {
      onlineManager.setOnline(true);
      return () => {
        appStateSubscription.remove();
      };
    }

    let netInfoUnsubscribe: (() => void) | undefined;
    let cancelled = false;

    void (async () => {
      try {
        await waitForNativeRuntimeReady();
        if (cancelled) {
          return;
        }
        const NetInfo = (await import("@react-native-community/netinfo"))
          .default;

        const apply = (
          connected: boolean | null,
          reachable: boolean | null,
        ) => {
          if (connected === false || reachable === false) {
            onlineManager.setOnline(false);
            return;
          }
          onlineManager.setOnline(true);
        };

        netInfoUnsubscribe = NetInfo.addEventListener((state) => {
          apply(state.isConnected, state.isInternetReachable);
        });

        void NetInfo.fetch()
          .then((state) => {
            apply(state.isConnected, state.isInternetReachable);
          })
          .catch(() => {
            if (!cancelled) {
              onlineManager.setOnline(true);
            }
          });
      } catch {
        if (!cancelled) {
          onlineManager.setOnline(true);
        }
      }
    })();

    return () => {
      cancelled = true;
      appStateSubscription.remove();
      netInfoUnsubscribe?.();
    };
  }, [skipNetwork]);
}
