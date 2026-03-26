import { useEffect, useState } from "react";

import { api, type PendingIntentsSummaryResponse } from "../../../lib/api";
import type { HomeTab } from "../../../types";

type UsePendingIntentSummaryInput = {
  activeTab: HomeTab;
  sessionAccessToken: string;
  sessionUserId: string;
  skipNetwork: boolean;
};

export function usePendingIntentSummary({
  activeTab,
  sessionAccessToken,
  sessionUserId,
  skipNetwork,
}: UsePendingIntentSummaryInput) {
  const [pendingIntentSummary, setPendingIntentSummary] =
    useState<PendingIntentsSummaryResponse | null>(null);

  useEffect(() => {
    if (skipNetwork || activeTab !== "home") {
      return;
    }

    let cancelled = false;
    const refreshPending = () => {
      void api
        .summarizePendingIntents(sessionUserId, 8, sessionAccessToken)
        .then((pending) => {
          if (!cancelled) {
            setPendingIntentSummary(pending);
          }
        })
        .catch(() => {});
    };

    refreshPending();
    const interval = setInterval(refreshPending, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeTab, sessionAccessToken, sessionUserId, skipNetwork]);

  return pendingIntentSummary;
}
