import * as Device from "expo-device";
import { Platform } from "react-native";

import { waitForNativeRuntimeReady } from "./native-runtime-ready";

export interface PushRegistrationResult {
  enabled: boolean;
  token: string | null;
}

let notificationHandlerPromise: Promise<void> | null = null;

async function ensureNotificationHandler(): Promise<void> {
  if (!notificationHandlerPromise) {
    notificationHandlerPromise = (async () => {
      await waitForNativeRuntimeReady();
      const { setNotificationHandler } =
        await import("expo-notifications/build/NotificationsHandler");
      setNotificationHandler({
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

export async function registerForPushNotificationsAsync(): Promise<PushRegistrationResult> {
  if (!Device.isDevice) {
    return {
      enabled: false,
      token: null,
    };
  }

  await waitForNativeRuntimeReady();
  await ensureNotificationHandler();

  const { getPermissionsAsync, requestPermissionsAsync } =
    await import("expo-notifications/build/NotificationPermissions");

  const { status: existingStatus } = await getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== "granted") {
    const { status } = await requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    return {
      enabled: false,
      token: null,
    };
  }

  if (Platform.OS === "android") {
    const { setNotificationChannelAsync } =
      await import("expo-notifications/build/setNotificationChannelAsync");
    const { AndroidImportance } =
      await import("expo-notifications/build/NotificationChannelManager.types");
    await setNotificationChannelAsync("default", {
      name: "default",
      importance: AndroidImportance.DEFAULT,
    });
  }

  const { getExpoPushTokenAsync } =
    await import("expo-notifications/build/getExpoPushTokenAsync");
  const token = await getExpoPushTokenAsync();
  return {
    enabled: true,
    token: token.data,
  };
}

export async function fireLocalNotification(title: string, body: string) {
  await waitForNativeRuntimeReady();
  await ensureNotificationHandler();
  const { scheduleNotificationAsync } =
    await import("expo-notifications/build/scheduleNotificationAsync");
  await scheduleNotificationAsync({
    content: {
      title,
      body,
    },
    trigger: null,
  });
}
