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
      .getExperienceActivitySummary(userId, accessToken)
      .then((summary) => {
        if (!active) {
          return;
        }

        setActivityState({
          hasUnread:
            summary.counts.pendingRequests > 0 ||
            summary.counts.unreadNotifications > 0,
          pendingRequestCount: summary.counts.pendingRequests,
          unreadNotificationCount: summary.counts.unreadNotifications,
          lastHydratedAt: summary.generatedAt,
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
