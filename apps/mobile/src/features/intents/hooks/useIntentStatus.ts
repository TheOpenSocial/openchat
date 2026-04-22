import { useCallback, useEffect, useMemo, useState } from "react";

import { api, type PendingIntentSummaryItem } from "../../../lib/api";
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
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<IntentAction | null>(null);
  const [explanation, setExplanation] = useState<Awaited<
    ReturnType<typeof api.getUserIntentExplanation>
  > | null>(null);
  const [summaryItem, setSummaryItem] =
    useState<PendingIntentSummaryItem | null>(null);
  const status = explanation?.status ?? null;
  const statusLabel = status ? formatStatusLabel(status) : null;
  const statusDescription = status ? formatStatusDescription(status) : null;
  const actionLocked = loading || acting != null;
  const canRetry = !actionLocked && status !== "cancelled";
  const canWiden =
    !actionLocked && status !== "cancelled" && status !== "ready";
  const canCancel = !actionLocked && status !== "cancelled";

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextExplanation, pendingSummary] = await Promise.all([
        api.getUserIntentExplanation(intentId, accessToken),
        api.summarizePendingIntents(userId, 8, accessToken).catch(() => null),
      ]);

      setExplanation(nextExplanation);
      setSummaryItem(
        pendingSummary?.intents.find((item) => item.intentId === intentId) ??
          null,
      );
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Unable to load this intent right now.",
      );
    } finally {
      setLoading(false);
    }
  }, [accessToken, intentId, userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const runAction = useCallback(
    async (action: IntentAction) => {
      if (
        (action === "retry" && !canRetry) ||
        (action === "widen" && !canWiden) ||
        (action === "cancel" && !canCancel)
      ) {
        return;
      }

      setActing(action);
      setError(null);
      try {
        if (action === "cancel") {
          await api.cancelIntent(intentId, userId, accessToken);
        }
        if (action === "retry") {
          await api.retryIntent(intentId, accessToken);
        }
        if (action === "widen") {
          await api.widenIntent(intentId, accessToken);
        }
        await refresh();
      } catch (nextError) {
        setError(
          nextError instanceof Error
            ? nextError.message
            : "Unable to update this intent.",
        );
      } finally {
        setActing(null);
      }
    },
    [accessToken, canCancel, canRetry, canWiden, intentId, refresh, userId],
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
    error,
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
