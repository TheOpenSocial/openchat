import type { SavedSearchRecord, ScheduledTaskRecord } from "../../../lib/api";

export type SavedSearchTaskItem = {
  id: string;
  kind: "saved-search";
  title: string;
  subtitle: string;
  meta: string;
  searchType: string;
  updatedAt: string;
  querySummary: string;
};

export type ScheduledTaskItem = {
  id: string;
  kind: "scheduled-task";
  title: string;
  subtitle: string;
  meta: string;
  taskType: string;
  status: string;
  scheduleLabel: string;
  nextRunAt: string | null;
  lastRunAt: string | null;
};

export type TaskItem = SavedSearchTaskItem | ScheduledTaskItem;

function formatDateLabel(value: string | null) {
  if (!value) {
    return "Not scheduled";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Not scheduled";
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function formatSavedSearchSummary(queryConfig: Record<string, unknown>) {
  const entries = Object.entries(queryConfig)
    .slice(0, 3)
    .map(([key, value]) => `${key}: ${String(value)}`);
  return entries.length > 0 ? entries.join(" · ") : "No query config";
}

function formatSavedSearchType(searchType: string) {
  switch (searchType) {
    case "discovery_people":
      return "Discovery people";
    case "discovery_groups":
      return "Discovery groups";
    case "reconnects":
      return "Reconnects";
    case "topic_search":
      return "Topic search";
    case "activity_search":
      return "Activity search";
    default:
      return searchType.replace(/_/g, " ");
  }
}

function formatTaskType(taskType: string) {
  switch (taskType) {
    case "saved_search":
      return "Saved search";
    case "discovery_briefing":
      return "Discovery briefing";
    case "reconnect_briefing":
      return "Reconnect briefing";
    case "social_reminder":
      return "Social reminder";
    default:
      return taskType.replace(/_/g, " ");
  }
}

function formatScheduleLabel(
  scheduleType: string,
  scheduleConfig: Record<string, unknown>,
) {
  if (scheduleType === "hourly") {
    const intervalHours = Number(scheduleConfig.intervalHours ?? 0);
    return intervalHours > 0 ? `Every ${intervalHours}h` : "Hourly";
  }

  if (scheduleType === "weekly") {
    const days = Array.isArray(scheduleConfig.days)
      ? scheduleConfig.days.filter(
          (day): day is string => typeof day === "string",
        )
      : [];
    const hour = Number(scheduleConfig.hour ?? 0);
    const minute = Number(scheduleConfig.minute ?? 0);
    const timeLabel = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    return days.length > 0
      ? `Weekly · ${days.join(", ")} · ${timeLabel}`
      : `Weekly · ${timeLabel}`;
  }

  return scheduleType.replace(/_/g, " ");
}

export function buildSavedSearchTaskItem(
  search: SavedSearchRecord,
): SavedSearchTaskItem {
  return {
    id: search.id,
    kind: "saved-search",
    meta: formatSavedSearchType(search.searchType),
    querySummary: formatSavedSearchSummary(search.queryConfig),
    subtitle: `Updated ${formatDateLabel(search.updatedAt)}`,
    title: search.title,
    updatedAt: search.updatedAt,
    searchType: search.searchType,
  };
}

export function buildScheduledTaskItem(
  task: ScheduledTaskRecord,
): ScheduledTaskItem {
  return {
    id: task.id,
    kind: "scheduled-task",
    lastRunAt: task.lastRunAt,
    meta: task.status,
    nextRunAt: task.nextRunAt,
    scheduleLabel: formatScheduleLabel(task.scheduleType, task.scheduleConfig),
    status: task.status,
    subtitle: task.description?.trim() || "No description provided",
    taskType: formatTaskType(task.taskType),
    title: task.title,
  };
}
