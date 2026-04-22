import type { NotificationRouteIntent as StoredNotificationRouteIntent } from "../../notifications/domain/notification-route-intent";

export type PushPermissionStatus =
  | "granted"
  | "denied"
  | "undetermined"
  | "unavailable"
  | "unknown";

export function describePushPermission(status: PushPermissionStatus) {
  switch (status) {
    case "granted":
      return "Granted";
    case "denied":
      return "Denied";
    case "undetermined":
      return "Undetermined";
    case "unavailable":
      return "Unavailable";
    case "unknown":
      return "Unknown";
  }
}

export function describeNotificationRouteIntent(
  intent: StoredNotificationRouteIntent | null,
): { label: string; targetId: string | null } | null {
  if (!intent) {
    return null;
  }

  switch (intent.target.kind) {
    case "activity":
      return { label: "Activity", targetId: null };
    case "connections":
      return { label: "Connections", targetId: null };
    case "discovery":
      return { label: "Discovery", targetId: intent.target.section ?? null };
    case "inbox":
      return { label: "Inbox", targetId: null };
    case "intent":
      return { label: "Intent detail", targetId: intent.target.intentId };
    case "profile":
      return { label: "Profile", targetId: intent.target.userId };
    case "recurringCircles":
      return {
        label: "Recurring circles",
        targetId: intent.target.circleId ?? null,
      };
    case "savedSearches":
      return { label: "Saved searches", targetId: null };
    case "scheduledTasks":
      return { label: "Scheduled tasks", targetId: null };
    case "settings":
      return { label: "Settings", targetId: null };
    case "chat":
      return { label: "Chat", targetId: intent.target.chatId };
  }
}
