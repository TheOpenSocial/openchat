type NotificationRouteKind =
  | "activity"
  | "connections"
  | "discovery"
  | "inbox"
  | "intent"
  | "profile"
  | "recurringcircles"
  | "savedsearches"
  | "scheduledtasks"
  | "settings"
  | "chat";

export type NotificationRouteTarget =
  | { kind: "activity" }
  | { kind: "connections" }
  | {
      kind: "discovery";
      section?: "tonight" | "groups" | "reconnects" | "inbox";
    }
  | { kind: "inbox" }
  | { kind: "intent"; intentId: string }
  | { kind: "profile"; userId: string }
  | { kind: "recurringCircles"; circleId?: string }
  | { kind: "savedSearches" }
  | { kind: "scheduledTasks" }
  | { kind: "settings" }
  | { kind: "chat"; chatId: string };

export interface NotificationRouteIntent {
  actionIdentifier: string | null;
  body: string | null;
  notificationId: string | null;
  rawData: Record<string, unknown>;
  target: NotificationRouteTarget;
  title: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function readNotificationRouteKind(
  value: unknown,
): NotificationRouteKind | null {
  const candidate = readString(value)?.toLowerCase();
  if (!candidate) {
    return null;
  }

  switch (candidate) {
    case "activity":
    case "connections":
    case "discovery":
    case "inbox":
    case "intent":
    case "profile":
    case "recurringcircles":
    case "recurring_circles":
    case "recurring-circles":
    case "savedsearches":
    case "saved_searches":
    case "saved-searches":
    case "scheduledtasks":
    case "scheduled_tasks":
    case "scheduled-tasks":
    case "settings":
    case "chat":
      return candidate.replace(/[-_]/g, "") as NotificationRouteKind;
    default:
      return null;
  }
}

function readNotificationRouteTarget(
  data: Record<string, unknown>,
): NotificationRouteTarget {
  const route =
    readNotificationRouteKind(data.route) ??
    readNotificationRouteKind(data.screen) ??
    readNotificationRouteKind(data.target) ??
    readNotificationRouteKind(data.kind) ??
    readNotificationRouteKind(data.type);

  if (route === "activity") return { kind: "activity" };
  if (route === "connections") return { kind: "connections" };
  if (route === "inbox") return { kind: "inbox" };
  if (route === "settings") return { kind: "settings" };
  if (route === "savedsearches") return { kind: "savedSearches" };
  if (route === "scheduledtasks") return { kind: "scheduledTasks" };
  if (route === "recurringcircles") {
    return {
      kind: "recurringCircles",
      ...(readString(data.circleId)
        ? { circleId: readString(data.circleId)! }
        : {}),
    };
  }
  if (route === "discovery") {
    const section = readString(data.section)?.toLowerCase();
    return {
      kind: "discovery",
      ...(section === "tonight" ||
      section === "groups" ||
      section === "reconnects" ||
      section === "inbox"
        ? { section }
        : {}),
    };
  }
  if (route === "profile") {
    const userId = readString(data.userId) ?? readString(data.targetUserId);
    if (userId) {
      return { kind: "profile", userId };
    }
  }
  if (route === "chat") {
    const chatId = readString(data.chatId) ?? readString(data.threadId);
    if (chatId) {
      return { kind: "chat", chatId };
    }
  }
  if (route === "intent") {
    const intentId = readString(data.intentId);
    if (intentId) {
      return { kind: "intent", intentId };
    }
  }

  const intentId = readString(data.intentId);
  if (intentId) {
    return { kind: "intent", intentId };
  }

  const chatId = readString(data.chatId) ?? readString(data.threadId);
  if (chatId) {
    return { kind: "chat", chatId };
  }

  const userId = readString(data.userId) ?? readString(data.targetUserId);
  if (userId) {
    return { kind: "profile", userId };
  }

  const circleId = readString(data.circleId);
  if (circleId) {
    return { kind: "recurringCircles", circleId };
  }

  return { kind: "activity" };
}

export function parseNotificationRouteIntent(
  input: unknown,
): NotificationRouteIntent | null {
  if (!isRecord(input)) {
    return null;
  }

  const rawData = isRecord(input.data)
    ? input.data
    : isRecord(input.payload)
      ? input.payload
      : {};
  const title = readString(input.title ?? input.notificationTitle);
  const body = readString(input.body ?? input.notificationBody);
  const notificationId =
    readString(input.notificationId) ??
    readString(input.id) ??
    readString(input.identifier);
  const actionIdentifier = readString(input.actionIdentifier);

  return {
    actionIdentifier,
    body,
    notificationId,
    rawData,
    target: readNotificationRouteTarget(rawData),
    title,
  };
}
