import { useCallback, useEffect, useMemo, useState } from "react";

import {
  api,
  type DiscoveryAgentRecommendationsResponse,
  type DiscoveryInboxSuggestionsResponse,
  type PassiveDiscoveryResponse,
} from "../../../lib/api";
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
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passiveDiscovery, setPassiveDiscovery] =
    useState<PassiveDiscoveryResponse | null>(null);
  const [inboxSuggestions, setInboxSuggestions] =
    useState<DiscoveryInboxSuggestionsResponse | null>(null);
  const [agentRecommendations, setAgentRecommendations] =
    useState<DiscoveryAgentRecommendationsResponse | null>(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);

    try {
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

      setAgentRecommendations(nextAgentRecommendations);
      setPassiveDiscovery(nextPassiveDiscovery);
      setInboxSuggestions(nextInboxSuggestions);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Unable to load discovery right now.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [accessToken, userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const viewModel = useMemo<DiscoveryFeedViewModel>(
    () =>
      buildDiscoveryViewModel({
        agentRecommendations,
        inboxSuggestions,
        passiveDiscovery,
      }),
    [agentRecommendations, inboxSuggestions, passiveDiscovery],
  );

  return {
    error,
    loading,
    refresh,
    refreshing,
    viewModel,
  };
}
