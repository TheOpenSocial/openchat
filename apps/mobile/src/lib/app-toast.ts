import Toast from "react-native-toast-message";

const MESSAGE_MAX = 240;

export type ShowErrorToastOptions = {
  title?: string;
};

/**
 * App-themed error toast (see `AppToastHost` for layout). Use from any screen under `SafeAreaProvider`.
 */
export function showErrorToast(
  message: string,
  options?: ShowErrorToastOptions,
): void {
  const trimmed = message.trim();
  const body =
    trimmed.length > MESSAGE_MAX
      ? `${trimmed.slice(0, MESSAGE_MAX - 1)}…`
      : trimmed;

  Toast.show({
    type: "appError",
    text1: options?.title ?? "Something went wrong",
    text2: body.length > 0 ? body : "Unknown error",
    position: "top",
    visibilityTime: 5500,
  });
}
