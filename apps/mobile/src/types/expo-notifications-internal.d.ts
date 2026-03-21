/**
 * Metro resolves these `build/*` entry points at runtime; the package does not ship TS subpath types.
 */
declare module "expo-notifications/build/NotificationsHandler" {
  export function setNotificationHandler(
    handler: {
      handleNotification: (notification: unknown) => Promise<{
        shouldPlaySound: boolean;
        shouldShowBanner: boolean;
        shouldSetBadge: boolean;
        shouldShowList: boolean;
      }>;
    } | null,
  ): void;
}

declare module "expo-notifications/build/NotificationPermissions" {
  export function getPermissionsAsync(): Promise<{
    status: string;
    granted?: boolean;
    ios?: { status: number };
  }>;
  export function requestPermissionsAsync(): Promise<{ status: string }>;
}

declare module "expo-notifications/build/setNotificationChannelAsync" {
  export function setNotificationChannelAsync(
    channelId: string,
    channel: { name: string; importance: number },
  ): Promise<unknown>;
}

declare module "expo-notifications/build/NotificationChannelManager.types" {
  export enum AndroidImportance {
    DEFAULT = 5,
  }
}

declare module "expo-notifications/build/getExpoPushTokenAsync" {
  export function getExpoPushTokenAsync(
    options?: Record<string, unknown>,
  ): Promise<{ type: string; data: string }>;
}

declare module "expo-notifications/build/scheduleNotificationAsync" {
  export function scheduleNotificationAsync(request: {
    content: { title: string; body: string };
    trigger: null;
  }): Promise<string>;
}
