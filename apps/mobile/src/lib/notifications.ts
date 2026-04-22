import * as Device from "expo-device";
import { Platform } from "react-native";

import {
  parseNotificationRouteIntent,
  type NotificationRouteIntent,
} from "../features/notifications/domain/notification-route-intent";
import { waitForNativeRuntimeReady } from "./native-runtime-ready";

export interface PushRegistrationResult {
  enabled: boolean;
  token: string | null;
}

export interface NotificationListenerEvent {
  body: string | null;
  data: Record<string, unknown>;
  notificationId: string | null;
  routeIntent: NotificationRouteIntent | null;
  title: string | null;
}

export interface NotificationListenerResponseEvent extends NotificationListenerEvent {
  actionIdentifier: string;
}

export interface NotificationListenerCallbacks {
  onReceived?: (event: NotificationListenerEvent) => void;
  onResponse?: (event: NotificationListenerResponseEvent) => void;
}

export interface NotificationListenerSubscription {
  remove: () => void;
}

export interface NotificationListenerSubscriptionSet {
  received: NotificationListenerSubscription | null;
  remove: () => void;
  response: NotificationListenerSubscription | null;
}

let notificationHandlerPromise: Promise<void> | null = null;

async function ensureNotificationHandler(): Promise<void> {
  if (!notificationHandlerPromise) {
    notificationHandlerPromise = (async () => {
      await waitForNativeRuntimeReady();
      const notifications = (await import("expo-notifications")) as any;
      notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldPlaySound: false,
          shouldShowBanner: true,
          shouldSetBadge: false,
          shouldShowList: true,
        }),
      });
    })();
  }
  await notificationHandlerPromise;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function extractNotificationEvent(notification: unknown): {
  body: string | null;
  data: Record<string, unknown>;
  notificationId: string | null;
  routeIntent: NotificationRouteIntent | null;
  title: string | null;
} | null {
  if (!isRecord(notification)) {
    return null;
  }

  const request = isRecord(notification.request) ? notification.request : null;
  const content = request && isRecord(request.content) ? request.content : null;
  const data = content && isRecord(content.data) ? content.data : {};

  return {
    body: readString(content?.body),
    data,
    notificationId:
      readString(request?.identifier) ?? readString(notification.identifier),
    routeIntent: parseNotificationRouteIntent({
      body: readString(content?.body),
      data,
      notificationId:
        readString(request?.identifier) ?? readString(notification.identifier),
      title: readString(content?.title),
    }),
    title: readString(content?.title),
  };
}

export async function registerForPushNotificationsAsync(): Promise<PushRegistrationResult> {
  if (!Device.isDevice) {
    return {
      enabled: false,
      token: null,
    };
  }

  await waitForNativeRuntimeReady();
  await ensureNotificationHandler();
  const notifications = (await import("expo-notifications")) as any;

  const { status: existingStatus } = await notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== "granted") {
    const { status } = await notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    return {
      enabled: false,
      token: null,
    };
  }

  if (Platform.OS === "android") {
    await notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: notifications.AndroidImportance.DEFAULT,
    });
  }

  const token = await notifications.getExpoPushTokenAsync();
  return {
    enabled: true,
    token: token.data,
  };
}

export async function registerNotificationListeners(
  callbacks: NotificationListenerCallbacks = {},
): Promise<NotificationListenerSubscriptionSet> {
  await waitForNativeRuntimeReady();
  await ensureNotificationHandler();

  const notifications = await import("expo-notifications");

  const received =
    typeof notifications.addNotificationReceivedListener === "function"
      ? notifications.addNotificationReceivedListener(
          (notification: unknown) => {
            const event = extractNotificationEvent(notification);
            if (event) {
              callbacks.onReceived?.(event);
            }
          },
        )
      : null;

  const response =
    typeof notifications.addNotificationResponseReceivedListener === "function"
      ? notifications.addNotificationResponseReceivedListener(
          (notificationResponse: unknown) => {
            if (!isRecord(notificationResponse)) {
              return;
            }

            const actionIdentifier = readString(
              notificationResponse.actionIdentifier,
            );
            const notificationEvent = extractNotificationEvent(
              notificationResponse.notification,
            );
            if (!actionIdentifier || !notificationEvent) {
              return;
            }

            callbacks.onResponse?.({
              ...notificationEvent,
              actionIdentifier,
            });
          },
        )
      : null;

  return {
    received,
    remove: () => {
      received?.remove();
      response?.remove();
    },
    response,
  };
}

export async function fireLocalNotification(
  title: string,
  body: string,
  data?: Record<string, unknown>,
) {
  await waitForNativeRuntimeReady();
  await ensureNotificationHandler();
  const notifications = (await import("expo-notifications")) as any;
  await notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      ...(data ? { data } : {}),
    },
    trigger: null,
  } as any);
}
