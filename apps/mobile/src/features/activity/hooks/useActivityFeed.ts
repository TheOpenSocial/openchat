import { useCallback, useEffect, useMemo, useState } from "react";

import {
  api,
  type DiscoveryInboxSuggestionsResponse,
  type InboxRequestRecord,
  type PendingIntentsSummaryResponse,
  type PassiveDiscoveryResponse,
} from "../../../lib/api";
import { useInboxStore } from "../../../store/inbox-store";
import {
  compareActivityItems,
  type ActivityItem,
} from "../domain/activity-item";

type UseActivityFeedArgs = {
  accessToken: string;
  userId: string;
};

type ActivityFeedState = {
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  items: ActivityItem[];
  pendingRequestCount: number;
  refresh: () => Promise<void>;
};

function buildRequestItems(requests: InboxRequestRecord[]): ActivityItem[] {
  return requests.map((request) => ({
    id: `request:${request.id}`,
    kind: "request",
    title:
      request.status === "pending"
        ? "New request waiting"
        : request.status === "accepted"
          ? "Request accepted"
          : request.status === "rejected"
            ? "Request declined"
            : "Request updated",
    body:
      request.status === "pending"
        ? "Someone is waiting for your response."
        : `This request is now ${request.status}.`,
    timestamp: request.respondedAt ?? request.createdAt,
    status: request.status,
    requestId: request.id,
    intentId: request.intentId,
  }));
}

function buildDiscoveryItems(
  inboxSuggestions: DiscoveryInboxSuggestionsResponse,
  passiveDiscovery: PassiveDiscoveryResponse,
): ActivityItem[] {
  const suggestionItems: ActivityItem[] = inboxSuggestions.suggestions.map(
    (suggestion, index) => ({
      id: `discovery:${index}:${suggestion.title}`,
      kind: "discovery",
      title: suggestion.title,
      body: suggestion.reason,
      scoreLabel: `${Math.round(suggestion.score * 100)}% match`,
    }),
  );

  const summaryItems: ActivityItem[] = [
    {
      id: "summary:tonight",
      kind: "summary",
      title: "Tonight is active",
      body: `${passiveDiscovery.tonight.suggestions.length} people and ${passiveDiscovery.groups.groups.length} group options are available.`,
    },
    {
      id: "summary:reconnects",
      kind: "summary",
      title: "Reconnects available",
      body: `${passiveDiscovery.reconnects.reconnects.length} people are worth revisiting.`,
    },
  ];

  return [...suggestionItems, ...summaryItems];
}

function buildIntentItems(
  pendingIntentsSummary: PendingIntentsSummaryResponse | null,
): ActivityItem[] {
  if (!pendingIntentsSummary) {
    return [];
  }

  return pendingIntentsSummary.intents.slice(0, 3).map((intent) => ({
    id: `intent:${intent.intentId}`,
    kind: "intent",
    title: intent.rawText,
    body: `${intent.requests.pending} pending · ${intent.requests.accepted} accepted · ${intent.requests.rejected + intent.requests.expired + intent.requests.cancelled} closed`,
    intentId: intent.intentId,
    status: intent.status,
  }));
}

export function useActivityFeed({
  accessToken,
  userId,
}: UseActivityFeedArgs): ActivityFeedState {
  const setRequestsInStore = useInboxStore((store) => store.setRequests);
  const pendingRequestCount = useInboxStore(
    (store) => store.pendingRequestCount,
  );
  const [requests, setRequests] = useState<InboxRequestRecord[]>([]);
  const [inboxSuggestions, setInboxSuggestions] =
    useState<DiscoveryInboxSuggestionsResponse | null>(null);
  const [passiveDiscovery, setPassiveDiscovery] =
    useState<PassiveDiscoveryResponse | null>(null);
  const [pendingIntentsSummary, setPendingIntentsSummary] =
    useState<PendingIntentsSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const [
        nextRequests,
        nextInboxSuggestions,
        nextPassiveDiscovery,
        nextPendingIntentsSummary,
      ] = await Promise.all([
        api.listPendingRequests(userId, accessToken),
        api.getDiscoveryInboxSuggestions(userId, 4, accessToken),
        api.getPassiveDiscovery(userId, 3, accessToken),
        api.summarizePendingIntents(userId, 4, accessToken).catch(() => null),
      ]);
      setRequests(nextRequests);
      setRequestsInStore(nextRequests);
      setInboxSuggestions(nextInboxSuggestions);
      setPassiveDiscovery(nextPassiveDiscovery);
      setPendingIntentsSummary(nextPendingIntentsSummary);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Unable to load activity right now.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [accessToken, setRequestsInStore, userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const items = useMemo(() => {
    const requestItems = buildRequestItems(requests);
    const intentItems = buildIntentItems(pendingIntentsSummary);
    const discoveryItems =
      inboxSuggestions && passiveDiscovery
        ? buildDiscoveryItems(inboxSuggestions, passiveDiscovery)
        : [];

    return [...requestItems, ...intentItems, ...discoveryItems].sort(
      compareActivityItems,
    );
  }, [inboxSuggestions, passiveDiscovery, pendingIntentsSummary, requests]);

  return {
    loading,
    refreshing,
    error,
    items,
    pendingRequestCount,
    refresh,
  };
}
