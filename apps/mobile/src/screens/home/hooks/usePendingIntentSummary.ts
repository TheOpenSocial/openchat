import { useEffect, useState } from "react";

import { api, type PendingIntentsSummaryResponse } from "../../../lib/api";
import type { HomeTab } from "../../../types";

type UsePendingIntentSummaryInput = {
  activeTab: HomeTab;
  designMock: boolean;
  sessionAccessToken: string;
  sessionUserId: string;
  skipNetwork: boolean;
};

export function usePendingIntentSummary({
  activeTab,
  designMock,
  sessionAccessToken,
  sessionUserId,
  skipNetwork,
}: UsePendingIntentSummaryInput) {
  const [pendingIntentSummary, setPendingIntentSummary] =
    useState<PendingIntentsSummaryResponse | null>(null);

  useEffect(() => {
    if (skipNetwork || designMock || activeTab !== "home") {
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
  }, [activeTab, designMock, sessionAccessToken, sessionUserId, skipNetwork]);

  return pendingIntentSummary;
}
