import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  api,
  type DiscoveryAgentRecommendationsResponse,
  type DiscoveryInboxSuggestionsResponse,
  type PassiveDiscoveryResponse,
} from "../../../lib/api";
import { mobileQueryKeys } from "../../../lib/query-client";
import {
  buildDiscoveryViewModel,
  type DiscoveryFeedViewModel,
} from "../domain/discovery-item";

type UseDiscoveryFeedArgs = {
  accessToken: string;
  userId: string;
};

export function useDiscoveryFeed({
  accessToken,
  userId,
}: UseDiscoveryFeedArgs) {
  const discoveryQuery = useQuery({
    enabled: Boolean(accessToken && userId),
    queryFn: async () => {
      const [
        nextAgentRecommendations,
        nextPassiveDiscovery,
        nextInboxSuggestions,
      ] = await Promise.all([
        api
          .publishAgentRecommendations(userId, { limit: 4 }, accessToken)
          .catch(() => null),
        api.getPassiveDiscovery(userId, 4, accessToken),
        api.getDiscoveryInboxSuggestions(userId, 4, accessToken),
      ]);

      return {
        agentRecommendations: nextAgentRecommendations,
        inboxSuggestions: nextInboxSuggestions,
        passiveDiscovery: nextPassiveDiscovery,
      };
    },
    queryKey: mobileQueryKeys.discoveryFeed(userId),
  });

  const refresh = useCallback(async () => {
    await discoveryQuery.refetch();
  }, [discoveryQuery]);

  const viewModel = useMemo<DiscoveryFeedViewModel>(
    () =>
      buildDiscoveryViewModel({
        agentRecommendations:
          (discoveryQuery.data
            ?.agentRecommendations as DiscoveryAgentRecommendationsResponse | null) ??
          null,
        inboxSuggestions:
          (discoveryQuery.data
            ?.inboxSuggestions as DiscoveryInboxSuggestionsResponse | null) ??
          null,
        passiveDiscovery:
          (discoveryQuery.data
            ?.passiveDiscovery as PassiveDiscoveryResponse | null) ?? null,
      }),
    [discoveryQuery.data],
  );

  return {
    error:
      discoveryQuery.error instanceof Error
        ? discoveryQuery.error.message
        : null,
    loading: discoveryQuery.isLoading && !discoveryQuery.data,
    refresh,
    refreshing: discoveryQuery.isRefetching,
    viewModel,
  };
}
