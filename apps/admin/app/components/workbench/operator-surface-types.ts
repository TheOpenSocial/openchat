export type ScheduledTaskStatus = "active" | "paused" | "disabled" | "archived";

export type ScheduledTaskType =
  | "saved_search"
  | "discovery_briefing"
  | "reconnect_briefing"
  | "social_reminder";

export type ScheduledTaskScheduleKind = "hourly" | "weekly";

export type ScheduledTaskDeliveryMode =
  | "notification"
  | "agent_thread"
  | "notification_and_agent_thread";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue }
  | JsonValue[];

export interface ScheduledTaskRecord {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  taskType: string;
  status: string;
  scheduleType: string;
  scheduleConfig: Record<string, unknown>;
  taskConfig: Record<string, unknown>;
  nextRunAt: string | null;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
  lastSuccessAt?: string | null;
  lastFailureAt?: string | null;
  lastFailureReason?: string | null;
}

export interface ScheduledTaskRunRecord {
  id: string;
  scheduledTaskId: string;
  userId: string;
  status: string;
  traceId: string;
  triggeredAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  resultSummary: string | null;
  resultPayload: Record<string, unknown> | null;
  errorMessage: string | null;
  createdNotificationId?: string | null;
  createdAgentMessageId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface SavedSearchRecord {
  id: string;
  userId: string;
  title: string;
  searchType: string;
  queryConfig: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export type ScheduledTasksSnapshot = ScheduledTaskRecord[];
export type ScheduledTaskRunsSnapshot = ScheduledTaskRunRecord[];
export type SavedSearchesSnapshot = SavedSearchRecord[];
