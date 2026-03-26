"use client";

import { useEffect } from "react";

export function useAdminHealthPolling(input: {
  sessionHydrated: boolean;
  hasSignedInSession: boolean;
  refreshHealth: () => Promise<void>;
}) {
  useEffect(() => {
    if (!input.sessionHydrated || !input.hasSignedInSession) {
      return;
    }

    input.refreshHealth().catch(() => {});
    const timer = setInterval(() => {
      input.refreshHealth().catch(() => {});
    }, 15_000);

    return () => clearInterval(timer);
  }, [input]);
}
