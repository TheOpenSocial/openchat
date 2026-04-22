import { useEffect } from "react";

import { api } from "../../../lib/api";
import { useActivityStore } from "../../../store/activity-store";

type UseActivityIndicatorArgs = {
  accessToken: string;
  userId: string;
};

export function useActivityIndicator({
  accessToken,
  userId,
}: UseActivityIndicatorArgs) {
  const setActivityState = useActivityStore((store) => store.setActivityState);

  useEffect(() => {
    let active = true;

    void api
      .listPendingRequests(userId, accessToken)
      .then((requests) => {
        if (!active) {
          return;
        }

        const pendingRequestCount = requests.filter(
          (request) => request.status === "pending",
        ).length;

        setActivityState({
          hasUnread: pendingRequestCount > 0,
          pendingRequestCount,
          lastHydratedAt: new Date().toISOString(),
        });
      })
      .catch(() => {
        if (!active) {
          return;
        }

        setActivityState({
          lastHydratedAt: new Date().toISOString(),
        });
      });

    return () => {
      active = false;
    };
  }, [accessToken, setActivityState, userId]);
}
