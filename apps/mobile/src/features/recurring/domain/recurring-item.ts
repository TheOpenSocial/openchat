import type {
  RecurringCircleRecord,
  RecurringCircleSessionRecord,
} from "../../../lib/api";

export interface RecurringCircleSessionItem {
  circleId: string;
  generatedIntentId: string | null;
  id: string;
  scheduledFor: string;
  scheduledForLabel: string;
  status: string;
  summary: string | null;
}

export interface RecurringCircleItem {
  description: string | null;
  id: string;
  nextSessionAt: string | null;
  nextSessionLabel: string;
  sessionCount: number;
  sessions: RecurringCircleSessionItem[];
  status: RecurringCircleRecord["status"];
  title: string;
  visibility: RecurringCircleRecord["visibility"];
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Not scheduled";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Not scheduled";
  }

  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function buildRecurringSessionItem(
  session: RecurringCircleSessionRecord,
): RecurringCircleSessionItem {
  return {
    circleId: session.circleId,
    generatedIntentId: session.generatedIntentId,
    id: session.id,
    scheduledFor: session.scheduledFor,
    scheduledForLabel: formatDateTime(session.scheduledFor),
    status: session.status,
    summary: session.summary,
  };
}

export function buildRecurringCircleItem(
  circle: RecurringCircleRecord,
  sessions: RecurringCircleSessionRecord[] = [],
): RecurringCircleItem {
  const nextSessionAt = circle.nextSessionAt ?? null;
  const sessionItems = sessions
    .slice()
    .sort(
      (left, right) =>
        Date.parse(right.scheduledFor) - Date.parse(left.scheduledFor),
    )
    .map(buildRecurringSessionItem);

  return {
    description: circle.description,
    id: circle.id,
    nextSessionAt,
    nextSessionLabel: formatDateTime(nextSessionAt),
    sessionCount: sessionItems.length,
    sessions: sessionItems,
    status: circle.status,
    title: circle.title,
    visibility: circle.visibility,
  };
}
