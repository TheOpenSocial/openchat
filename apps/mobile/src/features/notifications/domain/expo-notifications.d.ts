declare module "expo-notifications" {
  export interface NotificationSubscription {
    remove: () => void;
  }

  export function addNotificationReceivedListener(
    listener: (notification: unknown) => void,
  ): NotificationSubscription;

  export function addNotificationResponseReceivedListener(
    listener: (response: unknown) => void,
  ): NotificationSubscription;

  export function getLastNotificationResponseAsync(): Promise<unknown>;
}
