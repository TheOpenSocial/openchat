import { useCallback, useEffect, useMemo, useState } from "react";

import { api, type ExperienceActivitySummaryResponse } from "../../../lib/api";
import {
  loadStoredActivitySummary,
  saveStoredActivitySummary,
} from "../../../lib/experience-storage";
import { useActivityStore } from "../../../store/activity-store";
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
  sections: Array<{
    id:
      | "actionRequired"
      | "updates"
      | "activeIntents"
      | "suggestions"
      | "discoveryHighlights";
    title: string;
    subtitle: string;
    emphasis: "urgent" | "active" | "passive";
    items: ActivityItem[];
  }>;
  pendingRequestCount: number;
  refresh: () => Promise<void>;
};

function buildRequestItems(
  requests: ExperienceActivitySummaryResponse["sections"]["actionRequired"],
): ActivityItem[] {
  return requests.map((request) => ({
    id: `request:${request.id}`,
    kind: "request",
    priority: request.priority,
    eyebrow: request.eyebrow,
    title: request.title,
    body: request.body,
    timestamp:
      typeof request.createdAt === "string"
        ? request.createdAt
        : request.createdAt.toISOString(),
    status: request.status as
      | "pending"
      | "accepted"
      | "rejected"
      | "expired"
      | "cancelled",
    requestId: request.id,
    intentId: request.intentId ?? "",
  }));
}

function buildDiscoveryItems(
  suggestions: ExperienceActivitySummaryResponse["sections"]["suggestions"],
): ActivityItem[] {
  return suggestions.map((suggestion) => ({
    id: suggestion.id,
    kind: "discovery",
    priority: suggestion.priority,
    eyebrow: suggestion.eyebrow,
    title: suggestion.title,
    body: suggestion.body,
    scoreLabel: suggestion.scoreLabel,
  }));
}

function buildDiscoveryHighlightItems(
  highlights: ExperienceActivitySummaryResponse["sections"]["discoveryHighlights"],
): ActivityItem[] {
  return highlights.map((highlight) => ({
    id: highlight.id,
    kind: "summary",
    priority: highlight.priority,
    eyebrow: highlight.eyebrow,
    title: highlight.title,
    body: highlight.body,
  }));
}

function buildIntentItems(
  pendingIntents: ExperienceActivitySummaryResponse["sections"]["activeIntents"],
): ActivityItem[] {
  return pendingIntents.slice(0, 3).map((intent) => ({
    id: `intent:${intent.intentId}`,
    kind: "intent",
    priority: intent.priority,
    eyebrow: intent.eyebrow,
    title: intent.title,
    body: intent.body,
    intentId: intent.intentId,
    status: intent.status,
  }));
}

export function useActivityFeed({
  accessToken,
  userId,
}: UseActivityFeedArgs): ActivityFeedState {
  const storedSummary = useActivityStore((store) => store.summary);
  const setActivityState = useActivityStore((store) => store.setActivityState);
  const [activitySummary, setActivitySummary] =
    useState<ExperienceActivitySummaryResponse | null>(storedSummary);
  const [loading, setLoading] = useState(storedSummary == null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const nextSummary = await api.getExperienceActivitySummary(
        userId,
        accessToken,
      );
      setActivitySummary(nextSummary);
      setActivityState({
        hasUnread:
          nextSummary.counts.unreadNotifications > 0 ||
          nextSummary.counts.pendingRequests > 0,
        pendingRequestCount: nextSummary.counts.pendingRequests,
        lastHydratedAt: nextSummary.generatedAt,
        summary: nextSummary,
      });
      void saveStoredActivitySummary(userId, nextSummary).catch(() => {});
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
  }, [accessToken, setActivityState, userId]);

  useEffect(() => {
    let active = true;
    void loadStoredActivitySummary(userId).then((storedSummary) => {
      if (!active || !storedSummary) {
        return;
      }
      setActivitySummary((current) => current ?? storedSummary);
      setLoading(false);
      setActivityState({
        hasUnread:
          storedSummary.counts.unreadNotifications > 0 ||
          storedSummary.counts.pendingRequests > 0,
        pendingRequestCount: storedSummary.counts.pendingRequests,
        lastHydratedAt: storedSummary.generatedAt,
        summary: storedSummary,
      });
    });

    void refresh();
    return () => {
      active = false;
    };
  }, [refresh, setActivityState, userId]);

  const items = useMemo(() => {
    if (!activitySummary) {
      return [];
    }

    const requestItems = buildRequestItems(
      activitySummary.sections.actionRequired,
    );
    const updateItems: ActivityItem[] = activitySummary.sections.updates.map(
      (update) => ({
        id: `update:${update.id}`,
        kind: "summary",
        priority: update.priority,
        eyebrow: update.eyebrow,
        title: update.title,
        body: update.body,
      }),
    );
    const intentItems = buildIntentItems(
      activitySummary.sections.activeIntents,
    );
    const suggestionItems = buildDiscoveryItems(
      activitySummary.sections.suggestions,
    );
    const discoveryHighlightItems = buildDiscoveryHighlightItems(
      activitySummary.sections.discoveryHighlights,
    );

    return [
      ...requestItems,
      ...updateItems,
      ...intentItems,
      ...suggestionItems,
      ...discoveryHighlightItems,
    ].sort(compareActivityItems);
  }, [activitySummary]);

  const sections = useMemo(() => {
    if (!activitySummary) {
      return [];
    }

    const actionRequired = buildRequestItems(
      activitySummary.sections.actionRequired,
    );
    const updates: ActivityItem[] = activitySummary.sections.updates.map(
      (update) => ({
        id: `update:${update.id}`,
        kind: "summary",
        priority: update.priority,
        eyebrow: update.eyebrow,
        title: update.title,
        body: update.body,
      }),
    );
    const activeIntents = buildIntentItems(
      activitySummary.sections.activeIntents,
    );
    const suggestions = buildDiscoveryItems(
      activitySummary.sections.suggestions,
    );
    const discoveryHighlights = buildDiscoveryHighlightItems(
      activitySummary.sections.discoveryHighlights,
    );

    const itemsBySection = {
      actionRequired,
      updates,
      activeIntents,
      suggestions,
      discoveryHighlights,
    } as const;

    return activitySummary.orderedSections
      .map((section) => ({
        id: section.id,
        title: section.title,
        subtitle: section.subtitle,
        emphasis: section.emphasis,
        items: [...itemsBySection[section.id]].sort(compareActivityItems),
      }))
      .filter((section) => section.items.length > 0);
  }, [activitySummary]);

  return {
    loading,
    refreshing,
    error,
    items,
    sections,
    pendingRequestCount: activitySummary?.counts.pendingRequests ?? 0,
    refresh,
  };
}
