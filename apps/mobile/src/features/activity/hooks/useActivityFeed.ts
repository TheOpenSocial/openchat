import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  api,
  type ExperienceActivitySectionId,
  type ExperienceActivitySectionMeta,
  type ExperienceActivitySummaryResponse,
} from "../../../lib/api";
import {
  loadStoredActivitySummary,
  saveStoredActivitySummary,
} from "../../../lib/experience-storage";
import { mobileQueryKeys } from "../../../lib/query-client";
import { useActivityStore } from "../../../store/activity-store";
import { useInboxStore } from "../../../store/inbox-store";
import {
  compareActivityItems,
  type ActivityItem,
  type ActivitySection,
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
  sections: ActivitySection[];
  summary: ExperienceActivitySummaryResponse | null;
};

function hydrateStores(
  summary: ExperienceActivitySummaryResponse,
  setActivityState: (patch: {
    hasUnread: boolean;
    lastHydratedAt: string;
    pendingRequestCount: number;
    unreadNotificationCount: number;
  }) => void,
  setPendingRequestCount: (count: number) => void,
) {
  setActivityState({
    hasUnread:
      summary.counts.pendingRequests > 0 ||
      summary.counts.unreadNotifications > 0,
    lastHydratedAt: summary.generatedAt,
    pendingRequestCount: summary.counts.pendingRequests,
    unreadNotificationCount: summary.counts.unreadNotifications,
  });
  setPendingRequestCount(summary.counts.pendingRequests);
}

function emptySection(meta: ExperienceActivitySectionMeta): ActivitySection {
  return {
    ...meta,
    items: [],
  };
}

function requestItems(
  summary: ExperienceActivitySummaryResponse,
): ActivityItem[] {
  return summary.sections.actionRequired.map((item) => ({
    id: `request:${item.id}`,
    kind: "request",
    body: item.body,
    eyebrow: item.eyebrow,
    intentId: item.intentId,
    priority: item.priority,
    requestId: item.id,
    sectionId: "actionRequired",
    status: item.status,
    timestamp: item.createdAt,
    title: item.title,
  }));
}

function notificationItems(
  summary: ExperienceActivitySummaryResponse,
): ActivityItem[] {
  return summary.sections.updates.map((item) => ({
    id: `notification:${item.id}`,
    kind: "notification",
    body: item.body,
    eyebrow: item.eyebrow,
    isRead: item.isRead,
    notificationType: item.type,
    priority: item.priority,
    sectionId: "updates",
    timestamp: item.createdAt,
    title: item.title,
  }));
}

function intentItems(
  summary: ExperienceActivitySummaryResponse,
): ActivityItem[] {
  return summary.sections.activeIntents.map((item) => ({
    id: `intent:${item.intentId}`,
    kind: "intent",
    body: item.body,
    eyebrow: item.eyebrow,
    intentId: item.intentId,
    priority: item.priority,
    sectionId: "activeIntents",
    status: item.status,
    title: item.title,
  }));
}

function suggestionItems(
  summary: ExperienceActivitySummaryResponse,
): ActivityItem[] {
  return summary.sections.suggestions.map((item) => ({
    id: `discovery:${item.id}`,
    kind: "discovery",
    body: item.body,
    eyebrow: item.eyebrow,
    priority: item.priority,
    scoreLabel: item.scoreLabel,
    sectionId: "suggestions",
    title: item.title,
  }));
}

function highlightItems(
  summary: ExperienceActivitySummaryResponse,
): ActivityItem[] {
  return summary.sections.discoveryHighlights.map((item) => ({
    id: `summary:${item.id}`,
    kind: "summary",
    body: item.body,
    eyebrow: item.eyebrow,
    priority: item.priority,
    sectionId: "discoveryHighlights",
    title: item.title,
  }));
}

function sectionItems(
  summary: ExperienceActivitySummaryResponse,
  sectionId: ExperienceActivitySectionId,
) {
  switch (sectionId) {
    case "actionRequired":
      return requestItems(summary);
    case "updates":
      return notificationItems(summary);
    case "activeIntents":
      return intentItems(summary);
    case "suggestions":
      return suggestionItems(summary);
    case "discoveryHighlights":
      return highlightItems(summary);
  }
}

function buildSections(
  summary: ExperienceActivitySummaryResponse | null,
): ActivitySection[] {
  if (!summary) {
    return [];
  }

  return summary.orderedSections
    .map((meta) => {
      const items = sectionItems(summary, meta.id).sort(compareActivityItems);
      return items.length > 0 ? { ...meta, items } : emptySection(meta);
    })
    .filter((section) => section.items.length > 0);
}

export function useActivityFeed({
  accessToken,
  userId,
}: UseActivityFeedArgs): ActivityFeedState {
  const queryClient = useQueryClient();
  const setActivityState = useActivityStore((store) => store.setActivityState);
  const setPendingRequestCount = useInboxStore(
    (store) => store.setPendingRequestCount,
  );
  const pendingRequestCount = useInboxStore(
    (store) => store.pendingRequestCount,
  );
  const [summary, setSummary] =
    useState<ExperienceActivitySummaryResponse | null>(null);
  const activitySummaryQuery = useQuery({
    enabled: Boolean(userId) && Boolean(accessToken),
    queryKey: mobileQueryKeys.activitySummary(userId),
    queryFn: () => api.getExperienceActivitySummary(userId, accessToken),
  });

  useEffect(() => {
    let active = true;
    void loadStoredActivitySummary(userId)
      .then((stored) => {
        if (!active || !stored) {
          return;
        }
        setSummary(stored);
        hydrateStores(stored, setActivityState, setPendingRequestCount);
        queryClient.setQueryData(
          mobileQueryKeys.activitySummary(userId),
          stored,
        );
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [queryClient, setActivityState, setPendingRequestCount, userId]);

  const refresh = useCallback(async () => {
    const result = await activitySummaryQuery.refetch();
    if (result.data) {
      setSummary(result.data);
      hydrateStores(result.data, setActivityState, setPendingRequestCount);
      void saveStoredActivitySummary(userId, result.data).catch(() => {});
    }
  }, [activitySummaryQuery, setActivityState, setPendingRequestCount, userId]);

  useEffect(() => {
    if (!activitySummaryQuery.data) {
      return;
    }
    setSummary(activitySummaryQuery.data);
    hydrateStores(
      activitySummaryQuery.data,
      setActivityState,
      setPendingRequestCount,
    );
    void saveStoredActivitySummary(userId, activitySummaryQuery.data).catch(
      () => {},
    );
  }, [
    activitySummaryQuery.data,
    setActivityState,
    setPendingRequestCount,
    userId,
  ]);

  const activeSummary = activitySummaryQuery.data ?? summary;
  const sections = useMemo(() => buildSections(activeSummary), [activeSummary]);
  const items = useMemo(
    () =>
      sections.flatMap((section) => section.items).sort(compareActivityItems),
    [sections],
  );
  const error =
    activitySummaryQuery.error instanceof Error
      ? activitySummaryQuery.error.message
      : activitySummaryQuery.error
        ? "Unable to load activity right now."
        : null;

  return {
    loading: activitySummaryQuery.isLoading && !activeSummary,
    refreshing: activitySummaryQuery.isRefetching,
    error,
    items,
    pendingRequestCount,
    refresh,
    sections,
    summary: activeSummary,
  };
}
