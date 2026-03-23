/**
 * Some native-linked libraries construct `NativeEventEmitter` at module evaluation time.
 * On iOS that throws if the JS bundle runs before the native runtime is marked ready.
 * Defer those imports until after idle + paint.
 */
export function waitForNativeRuntimeReady(): Promise<void> {
  return new Promise((resolve) => {
    const idleCallback = (
      globalThis as typeof globalThis & {
        requestIdleCallback?: (cb: () => void) => number;
      }
    ).requestIdleCallback;
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
    if (typeof idleCallback === "function") {
      idleCallback(() => {
        finish();
      });
    } else {
      setTimeout(finish, 50);
    }
    setTimeout(finish, 750);
  });
}
