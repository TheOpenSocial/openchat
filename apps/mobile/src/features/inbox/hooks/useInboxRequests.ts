import { useCallback, useEffect, useState } from "react";

import { api, type InboxRequestRecord } from "../../../lib/api";
import { useInboxStore } from "../../../store/inbox-store";

type UseInboxRequestsArgs = {
  accessToken: string;
  userId: string;
};

export function useInboxRequests({
  accessToken,
  userId,
}: UseInboxRequestsArgs) {
  const setRequestsInStore = useInboxStore((store) => store.setRequests);
  const [requests, setRequests] = useState<InboxRequestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actingRequestId, setActingRequestId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const nextRequests = await api.listPendingRequests(userId, accessToken);
      setRequests(nextRequests);
      setRequestsInStore(nextRequests);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Unable to load inbox right now.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [accessToken, setRequestsInStore, userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const accept = useCallback(
    async (requestId: string) => {
      setActingRequestId(requestId);
      setError(null);
      try {
        await api.acceptRequest(requestId, accessToken);
        await refresh();
      } catch (nextError) {
        setError(
          nextError instanceof Error
            ? nextError.message
            : "Unable to accept this request.",
        );
      } finally {
        setActingRequestId(null);
      }
    },
    [accessToken, refresh],
  );

  const reject = useCallback(
    async (requestId: string) => {
      setActingRequestId(requestId);
      setError(null);
      try {
        await api.rejectRequest(requestId, accessToken);
        await refresh();
      } catch (nextError) {
        setError(
          nextError instanceof Error
            ? nextError.message
            : "Unable to reject this request.",
        );
      } finally {
        setActingRequestId(null);
      }
    },
    [accessToken, refresh],
  );

  return {
    accept,
    actingRequestId,
    error,
    loading,
    refresh,
    refreshing,
    reject,
    requests,
  };
}
