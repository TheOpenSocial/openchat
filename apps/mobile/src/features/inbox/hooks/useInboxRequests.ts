import { useCallback, useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, type InboxRequestRecord } from "../../../lib/api";
import { mobileQueryKeys } from "../../../lib/query-client";
import { useInboxStore } from "../../../store/inbox-store";

type UseInboxRequestsArgs = {
  accessToken: string;
  userId: string;
};

export function useInboxRequests({
  accessToken,
  userId,
}: UseInboxRequestsArgs) {
  const queryClient = useQueryClient();
  const setRequestsInStore = useInboxStore((store) => store.setRequests);
  const requestsQuery = useQuery({
    enabled: Boolean(accessToken && userId),
    queryFn: () => api.listPendingRequests(userId, accessToken),
    queryKey: mobileQueryKeys.inboxRequests(userId),
  });

  const requests = useMemo<InboxRequestRecord[]>(
    () => requestsQuery.data ?? [],
    [requestsQuery.data],
  );

  useEffect(() => {
    setRequestsInStore(requests);
  }, [requests, setRequestsInStore]);

  const refresh = useCallback(async () => {
    await requestsQuery.refetch();
  }, [requestsQuery]);

  const acceptMutation = useMutation({
    mutationFn: (requestId: string) =>
      api.acceptRequest(requestId, accessToken),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: mobileQueryKeys.inboxRequests(userId),
      });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (requestId: string) =>
      api.rejectRequest(requestId, accessToken),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: mobileQueryKeys.inboxRequests(userId),
      });
    },
  });

  const accept = useCallback(
    async (requestId: string) => {
      await acceptMutation.mutateAsync(requestId);
    },
    [acceptMutation],
  );

  const reject = useCallback(
    async (requestId: string) => {
      await rejectMutation.mutateAsync(requestId);
    },
    [rejectMutation],
  );

  const actingRequestId =
    acceptMutation.variables ?? rejectMutation.variables ?? null;
  const error =
    (acceptMutation.error instanceof Error && acceptMutation.error.message) ||
    (rejectMutation.error instanceof Error && rejectMutation.error.message) ||
    (requestsQuery.error instanceof Error && requestsQuery.error.message) ||
    null;

  return {
    accept,
    actingRequestId,
    error,
    loading: requestsQuery.isLoading && !requestsQuery.data,
    refresh,
    refreshing: requestsQuery.isRefetching,
    reject,
    requests,
  };
}
