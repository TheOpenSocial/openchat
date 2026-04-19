import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, type PendingIntentSummaryItem } from "../../../lib/api";
import { mobileQueryKeys } from "../../../lib/query-client";
import { buildIntentDetailViewModel } from "../domain/intent-detail";

type UseIntentStatusArgs = {
  accessToken: string;
  intentId: string;
  userId: string;
};

type IntentAction = "cancel" | "retry" | "widen";

function formatStatusLabel(status: string) {
  switch (status) {
    case "parsed":
      return "Queued";
    case "fanout":
      return "Sending out";
    case "matching":
      return "Matching";
    case "ready":
      return "Ready";
    case "no_match":
      return "No match";
    case "cancelled":
      return "Cancelled";
    default:
      return status
        .replace(/_/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase());
  }
}

function formatStatusDescription(status: string) {
  switch (status) {
    case "parsed":
      return "We have understood the intent and are preparing the next step.";
    case "fanout":
      return "The request is being sent to matching people right now.";
    case "matching":
      return "The system is actively looking for relevant responses.";
    case "ready":
      return "Enough responses have arrived to move this forward.";
    case "no_match":
      return "There are no strong matches yet, so a retry or widen can help.";
    case "cancelled":
      return "This intent was cancelled and will not continue routing.";
    default:
      return `Current status: ${formatStatusLabel(status).toLowerCase()}.`;
  }
}

export function useIntentStatus({
  accessToken,
  intentId,
  userId,
}: UseIntentStatusArgs) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const intentQuery = useQuery({
    enabled: Boolean(accessToken && intentId && userId),
    queryFn: async () => {
      const [explanation, pendingSummary] = await Promise.all([
        api.getUserIntentExplanation(intentId, accessToken),
        api.summarizePendingIntents(userId, 8, accessToken).catch(() => null),
      ]);

      return {
        explanation,
        summaryItem:
          pendingSummary?.intents.find((item) => item.intentId === intentId) ??
          null,
      };
    },
    queryKey: mobileQueryKeys.intentStatus(userId, intentId),
  });

  const actionMutation = useMutation({
    mutationFn: async (action: IntentAction) => {
      if (action === "cancel") {
        await api.cancelIntent(intentId, userId, accessToken);
      }
      if (action === "retry") {
        await api.retryIntent(intentId, accessToken);
      }
      if (action === "widen") {
        await api.widenIntent(intentId, accessToken);
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: mobileQueryKeys.intentStatus(userId, intentId),
      });
    },
  });

  const acting = actionMutation.variables ?? null;
  const explanation = intentQuery.data?.explanation ?? null;
  const summaryItem = intentQuery.data?.summaryItem ?? null;
  const status = explanation?.status ?? null;
  const statusLabel = status ? formatStatusLabel(status) : null;
  const statusDescription = status ? formatStatusDescription(status) : null;
  const loading = intentQuery.isLoading && !intentQuery.data;
  const actionLocked = loading || acting != null;
  const canRetry = !actionLocked && status !== "cancelled";
  const canWiden =
    !actionLocked && status !== "cancelled" && status !== "ready";
  const canCancel = !actionLocked && status !== "cancelled";

  const refresh = useCallback(async () => {
    setError(null);
    await intentQuery.refetch();
  }, [intentQuery]);

  const runAction = useCallback(
    async (action: IntentAction) => {
      if (
        (action === "retry" && !canRetry) ||
        (action === "widen" && !canWiden) ||
        (action === "cancel" && !canCancel)
      ) {
        return;
      }

      setError(null);
      try {
        await actionMutation.mutateAsync(action);
      } catch (nextError) {
        setError(
          nextError instanceof Error
            ? nextError.message
            : "Unable to update this intent.",
        );
      }
    },
    [actionMutation, canCancel, canRetry, canWiden],
  );

  const viewModel = useMemo(() => {
    if (!explanation) {
      return null;
    }

    return buildIntentDetailViewModel({
      explanation,
      summaryItem,
    });
  }, [explanation, summaryItem]);

  return {
    acting,
    error:
      error ||
      (intentQuery.error instanceof Error && intentQuery.error.message) ||
      (actionMutation.error instanceof Error && actionMutation.error.message) ||
      null,
    canCancel,
    canRetry,
    canWiden,
    loading,
    statusDescription,
    statusLabel,
    refresh,
    runAction,
    viewModel,
  };
}
