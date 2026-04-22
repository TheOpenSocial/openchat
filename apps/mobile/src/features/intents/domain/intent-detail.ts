import type {
  PendingIntentSummaryItem,
  UserIntentExplanation,
} from "../../../lib/api";

export interface IntentDetailViewModel {
  body: string;
  factors: string[];
  intentId: string;
  rawText: string;
  requestsLabel: string;
  status: string;
  summary: string;
}

export function buildIntentDetailViewModel(input: {
  explanation: UserIntentExplanation;
  summaryItem: PendingIntentSummaryItem | null;
}): IntentDetailViewModel {
  const summaryItem = input.summaryItem;

  return {
    body: summaryItem?.rawText ?? "This intent is still active in the system.",
    factors: input.explanation.factors,
    intentId: input.explanation.intentId,
    rawText: summaryItem?.rawText ?? "Current intent",
    requestsLabel: summaryItem
      ? `${summaryItem.requests.pending} pending · ${summaryItem.requests.accepted} accepted · ${summaryItem.requests.rejected + summaryItem.requests.expired + summaryItem.requests.cancelled} closed`
      : "Request totals are not available right now.",
    status: input.explanation.status,
    summary: input.explanation.summary,
  };
}
