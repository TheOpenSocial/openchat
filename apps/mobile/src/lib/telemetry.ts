import AsyncStorage from "@react-native-async-storage/async-storage";

const TELEMETRY_KEY_PREFIX = "opensocial.mobile.telemetry.v1";
const TELEMETRY_EVENT_CAP = 1500;

export type TelemetryEventName =
  | "app_opened"
  | "auth_success"
  | "auth_session_restored"
  | "onboarding_completed"
  | "onboarding_activation_ready"
  | "onboarding_activation_started"
  | "onboarding_activation_succeeded"
  | "onboarding_activation_queued"
  | "onboarding_activation_failed"
  | "intent_created"
  | "agent_turn_completed"
  | "request_sent"
  | "request_received"
  | "request_accepted"
  | "request_declined"
  | "report_submitted"
  | "user_blocked"
  | "connection_created"
  | "chat_started"
  | "first_message_sent"
  | "message_replied"
  | "personalization_changed"
  | "notification_local_fired"
  | "notification_opened"
  | "digest_requested"
  | "chat_sync_manual"
  | "chat_sync_failed"
  | "home_thread_load_failed"
  | "home_thread_load_retried"
  | "home_thread_state_transition"
  | "home_thread_state_duration";

export interface TelemetryEvent {
  id: string;
  userId: string;
  name: TelemetryEventName;
  occurredAt: string;
  properties?: Record<string, unknown>;
}

export interface TelemetrySummary {
  totalEvents: number;
  lastEventAt: string | null;
  counters: {
    authEvents: number;
    onboardingCompleted: number;
    onboardingActivationReady: number;
    onboardingActivationStarted: number;
    onboardingActivationSucceeded: number;
    onboardingActivationQueued: number;
    onboardingActivationFailed: number;
    intentsCreated: number;
    agentTurnsCompleted: number;
    requestsSent: number;
    requestsReceived: number;
    requestsResponded: number;
    reportsSubmitted: number;
    usersBlocked: number;
    connectionsCreated: number;
    groupConnectionsCreated: number;
    chatsStarted: number;
    groupChatsReady: number;
    firstMessagesSent: number;
    messageReplies: number;
    personalizationChanges: number;
    notificationsFired: number;
    notificationsOpened: number;
    syncRuns: number;
    syncFailures: number;
  };
  metrics: {
    avgIntentToFirstAcceptanceSeconds: number | null;
    avgIntentToFirstMessageSeconds: number | null;
    connectionSuccessRate: number | null;
    groupFormationCompletionRate: number | null;
    notificationToOpenRate: number | null;
    moderationIncidentRate: number | null;
    repeatConnectionRate: number | null;
    syncFailureRate: number | null;
    activationSuccessRate: number | null;
    activationQueuedRate: number | null;
    activationFailureRate: number | null;
    avgActivationCompletionSeconds: number | null;
  };
}

function telemetryStorageKey(userId: string) {
  return `${TELEMETRY_KEY_PREFIX}.${userId}`;
}

function createEventId() {
  const millis = Date.now().toString(36);
  const suffix = Math.floor(Math.random() * 1_000_000_000)
    .toString(36)
    .padStart(6, "0");
  return `${millis}-${suffix}`;
}

function normalizeProperties(
  properties?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!properties) {
    return undefined;
  }

  const normalizedEntries = Object.entries(properties).filter(([, value]) => {
    if (value == null) {
      return false;
    }
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      return true;
    }
    if (Array.isArray(value)) {
      return value.every(
        (item) =>
          typeof item === "string" ||
          typeof item === "number" ||
          typeof item === "boolean",
      );
    }
    return false;
  });

  if (normalizedEntries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(normalizedEntries);
}

function parseEvents(raw: string | null): TelemetryEvent[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((row): row is TelemetryEvent => {
      return (
        typeof row === "object" &&
        row !== null &&
        typeof (row as TelemetryEvent).id === "string" &&
        typeof (row as TelemetryEvent).userId === "string" &&
        typeof (row as TelemetryEvent).name === "string" &&
        typeof (row as TelemetryEvent).occurredAt === "string"
      );
    });
  } catch {
    return [];
  }
}

function toTimestamp(input: string) {
  const parsed = Date.parse(input);
  return Number.isFinite(parsed) ? parsed : 0;
}

function readEventStringProperty(event: TelemetryEvent, key: string) {
  const value = event.properties?.[key];
  return typeof value === "string" ? value : null;
}

function readEventNumberProperty(event: TelemetryEvent, key: string) {
  const value = event.properties?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function calculateAverageDurations(
  startEvents: TelemetryEvent[],
  endEvents: TelemetryEvent[],
) {
  if (startEvents.length === 0 || endEvents.length === 0) {
    return null;
  }

  const starts = [...startEvents].sort(
    (left, right) =>
      toTimestamp(left.occurredAt) - toTimestamp(right.occurredAt),
  );
  const ends = [...endEvents].sort(
    (left, right) =>
      toTimestamp(left.occurredAt) - toTimestamp(right.occurredAt),
  );

  let endIndex = 0;
  const durations: number[] = [];
  for (const startEvent of starts) {
    const startTime = toTimestamp(startEvent.occurredAt);
    while (
      endIndex < ends.length &&
      toTimestamp(ends[endIndex]?.occurredAt ?? "") < startTime
    ) {
      endIndex += 1;
    }
    if (endIndex >= ends.length) {
      break;
    }
    const durationSeconds = Math.max(
      0,
      Math.round(
        (toTimestamp(ends[endIndex]?.occurredAt ?? "") - startTime) / 1000,
      ),
    );
    durations.push(durationSeconds);
    endIndex += 1;
  }

  if (durations.length === 0) {
    return null;
  }
  return Math.round(
    durations.reduce((sum, current) => sum + current, 0) / durations.length,
  );
}

export async function loadTelemetryEvents(
  userId: string,
): Promise<TelemetryEvent[]> {
  const raw = await AsyncStorage.getItem(telemetryStorageKey(userId));
  return parseEvents(raw);
}

export async function trackTelemetryEvent(
  userId: string,
  name: TelemetryEventName,
  properties?: Record<string, unknown>,
): Promise<void> {
  const raw = await AsyncStorage.getItem(telemetryStorageKey(userId));
  const current = parseEvents(raw);

  const nextEvent: TelemetryEvent = {
    id: createEventId(),
    userId,
    name,
    occurredAt: new Date().toISOString(),
    properties: normalizeProperties(properties),
  };
  const next = [...current, nextEvent].slice(-TELEMETRY_EVENT_CAP);
  await AsyncStorage.setItem(telemetryStorageKey(userId), JSON.stringify(next));
}

export async function clearTelemetryEvents(userId: string): Promise<void> {
  await AsyncStorage.removeItem(telemetryStorageKey(userId));
}

export async function getTelemetrySummary(
  userId: string,
): Promise<TelemetrySummary> {
  const events = await loadTelemetryEvents(userId);
  const counters = {
    authEvents: 0,
    onboardingCompleted: 0,
    onboardingActivationReady: 0,
    onboardingActivationStarted: 0,
    onboardingActivationSucceeded: 0,
    onboardingActivationQueued: 0,
    onboardingActivationFailed: 0,
    intentsCreated: 0,
    agentTurnsCompleted: 0,
    requestsSent: 0,
    requestsReceived: 0,
    requestsResponded: 0,
    reportsSubmitted: 0,
    usersBlocked: 0,
    connectionsCreated: 0,
    groupConnectionsCreated: 0,
    chatsStarted: 0,
    groupChatsReady: 0,
    firstMessagesSent: 0,
    messageReplies: 0,
    personalizationChanges: 0,
    notificationsFired: 0,
    notificationsOpened: 0,
    syncRuns: 0,
    syncFailures: 0,
  };

  for (const event of events) {
    if (
      event.name === "auth_success" ||
      event.name === "auth_session_restored"
    ) {
      counters.authEvents += 1;
      continue;
    }
    if (event.name === "onboarding_completed") {
      counters.onboardingCompleted += 1;
      continue;
    }
    if (event.name === "onboarding_activation_ready") {
      counters.onboardingActivationReady += 1;
      continue;
    }
    if (event.name === "onboarding_activation_started") {
      counters.onboardingActivationStarted += 1;
      continue;
    }
    if (event.name === "onboarding_activation_succeeded") {
      counters.onboardingActivationSucceeded += 1;
      continue;
    }
    if (event.name === "onboarding_activation_queued") {
      counters.onboardingActivationQueued += 1;
      continue;
    }
    if (event.name === "onboarding_activation_failed") {
      counters.onboardingActivationFailed += 1;
      continue;
    }
    if (event.name === "intent_created") {
      counters.intentsCreated += 1;
      continue;
    }
    if (event.name === "agent_turn_completed") {
      counters.agentTurnsCompleted += 1;
      continue;
    }
    if (event.name === "request_sent") {
      counters.requestsSent += 1;
      continue;
    }
    if (event.name === "request_received") {
      counters.requestsReceived += 1;
      continue;
    }
    if (
      event.name === "request_accepted" ||
      event.name === "request_declined"
    ) {
      counters.requestsResponded += 1;
      continue;
    }
    if (event.name === "report_submitted") {
      counters.reportsSubmitted += 1;
      continue;
    }
    if (event.name === "user_blocked") {
      counters.usersBlocked += 1;
      continue;
    }
    if (event.name === "connection_created") {
      counters.connectionsCreated += 1;
      if (readEventStringProperty(event, "type") === "group") {
        counters.groupConnectionsCreated += 1;
      }
      continue;
    }
    if (event.name === "chat_started") {
      counters.chatsStarted += 1;
      if (readEventStringProperty(event, "type") === "group") {
        const participantCount = readEventNumberProperty(
          event,
          "participantCount",
        );
        if (participantCount != null && participantCount >= 3) {
          counters.groupChatsReady += 1;
        }
      }
      continue;
    }
    if (event.name === "first_message_sent") {
      counters.firstMessagesSent += 1;
      continue;
    }
    if (event.name === "message_replied") {
      counters.messageReplies += 1;
      continue;
    }
    if (event.name === "personalization_changed") {
      counters.personalizationChanges += 1;
      continue;
    }
    if (event.name === "notification_local_fired") {
      counters.notificationsFired += 1;
      continue;
    }
    if (event.name === "notification_opened") {
      counters.notificationsOpened += 1;
      continue;
    }
    if (event.name === "chat_sync_manual") {
      counters.syncRuns += 1;
      continue;
    }
    if (event.name === "chat_sync_failed") {
      counters.syncFailures += 1;
      continue;
    }
  }

  const intentCreatedEvents = events.filter(
    (event) => event.name === "intent_created",
  );
  const requestAcceptedEvents = events.filter(
    (event) => event.name === "request_accepted",
  );
  const firstMessageEvents = events.filter(
    (event) => event.name === "first_message_sent",
  );

  const avgIntentToFirstAcceptanceSeconds = calculateAverageDurations(
    intentCreatedEvents,
    requestAcceptedEvents,
  );
  const avgIntentToFirstMessageSeconds = calculateAverageDurations(
    intentCreatedEvents,
    firstMessageEvents,
  );

  const connectionSuccessRate =
    counters.connectionsCreated > 0
      ? Number((counters.chatsStarted / counters.connectionsCreated).toFixed(3))
      : null;
  const groupFormationCompletionRate =
    counters.groupConnectionsCreated > 0
      ? Number(
          (counters.groupChatsReady / counters.groupConnectionsCreated).toFixed(
            3,
          ),
        )
      : null;
  const notificationToOpenRate =
    counters.notificationsFired > 0
      ? Number(
          (counters.notificationsOpened / counters.notificationsFired).toFixed(
            3,
          ),
        )
      : null;
  const sentMessageCount = counters.firstMessagesSent + counters.messageReplies;
  const moderationIncidentRate =
    sentMessageCount > 0
      ? Number((counters.reportsSubmitted / sentMessageCount).toFixed(3))
      : null;
  const repeatConnectionRate =
    counters.chatsStarted > 0
      ? Number(
          (
            Math.max(counters.chatsStarted - 1, 0) / counters.chatsStarted
          ).toFixed(3),
        )
      : null;
  const syncFailureRate =
    counters.syncRuns > 0
      ? Number((counters.syncFailures / counters.syncRuns).toFixed(3))
      : null;
  const activationSuccessRate =
    counters.onboardingActivationStarted > 0
      ? Number(
          (
            counters.onboardingActivationSucceeded /
            counters.onboardingActivationStarted
          ).toFixed(3),
        )
      : null;
  const activationQueuedRate =
    counters.onboardingActivationStarted > 0
      ? Number(
          (
            counters.onboardingActivationQueued /
            counters.onboardingActivationStarted
          ).toFixed(3),
        )
      : null;
  const activationFailureRate =
    counters.onboardingActivationStarted > 0
      ? Number(
          (
            counters.onboardingActivationFailed /
            counters.onboardingActivationStarted
          ).toFixed(3),
        )
      : null;

  const activationCompletionEvents = events.filter(
    (event) => event.name === "onboarding_activation_succeeded",
  );
  const activationCompletionDurationsSeconds = activationCompletionEvents
    .map((event) => readEventNumberProperty(event, "elapsedMs"))
    .filter((value): value is number => value != null && value >= 0)
    .map((value) => Math.round(value / 1000));
  const avgActivationCompletionSeconds =
    activationCompletionDurationsSeconds.length > 0
      ? Math.round(
          activationCompletionDurationsSeconds.reduce(
            (sum, current) => sum + current,
            0,
          ) / activationCompletionDurationsSeconds.length,
        )
      : null;

  return {
    totalEvents: events.length,
    lastEventAt: events.at(-1)?.occurredAt ?? null,
    counters,
    metrics: {
      avgIntentToFirstAcceptanceSeconds,
      avgIntentToFirstMessageSeconds,
      connectionSuccessRate,
      groupFormationCompletionRate,
      notificationToOpenRate,
      moderationIncidentRate,
      repeatConnectionRate,
      syncFailureRate,
      activationSuccessRate,
      activationQueuedRate,
      activationFailureRate,
      avgActivationCompletionSeconds,
    },
  };
}
