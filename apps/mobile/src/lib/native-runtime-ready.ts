import { InteractionManager } from "react-native";

/**
 * Some native-linked libraries construct `NativeEventEmitter` at module evaluation time.
 * On iOS that throws if the JS bundle runs before the native runtime is marked ready.
 * Defer those imports until after interactions + paint.
 */
export function waitForNativeRuntimeReady(): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          resolve();
        });
      });
    };
    InteractionManager.runAfterInteractions(finish);
    setTimeout(finish, 750);
  });
}
