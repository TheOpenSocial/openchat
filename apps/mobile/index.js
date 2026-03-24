require("react-native-reanimated");

const ENABLE_STARTUP_DIAGNOSTICS =
  process.env.EXPO_PUBLIC_STARTUP_DIAGNOSTICS === "1";

if (ENABLE_STARTUP_DIAGNOSTICS) {
  const warn = console.warn.bind(console);
  const trackedWarnSnippets = [
    "ProgressBarAndroid has been extracted from react-native core",
    "SafeAreaView has been deprecated",
    "Clipboard has been extracted from react-native core",
    "InteractionManager has been deprecated",
    "PushNotificationIOS has been extracted from react-native core",
  ];
  console.warn = (...args) => {
    try {
      const message = args.map((part) => String(part)).join(" ");
      if (trackedWarnSnippets.some((snippet) => message.includes(snippet))) {
        console.error("[rn-deprecated-access-trace]", {
          message,
          stack: new Error("deprecated-rn-api-access").stack,
        });
      }
    } catch {
      // diagnostics should never interfere with runtime
    }
    warn(...args);
  };
}

if (
  globalThis.ErrorUtils?.getGlobalHandler &&
  globalThis.ErrorUtils?.setGlobalHandler
) {
  const prev = globalThis.ErrorUtils.getGlobalHandler();
  globalThis.ErrorUtils.setGlobalHandler((error, isFatal) => {
    console.error("[startup-error]", {
      isFatal,
      message: error?.message ?? String(error),
      stack: error?.stack ?? null,
    });
    prev?.(error, isFatal);
  });
}

const splash = require("expo-splash-screen");
const SplashScreen = splash?.preventAutoHideAsync
  ? splash
  : (splash?.default ?? {});
const { registerRootComponent } = require("expo");
const App = require("./App").default;

if (typeof SplashScreen.preventAutoHideAsync === "function") {
  void SplashScreen.preventAutoHideAsync();
}

registerRootComponent(App);
