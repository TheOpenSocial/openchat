import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { View } from "react-native";

import systemBlob from "../../assets/brand/gradient-blob.json";

export type SystemBlobAnimationHandle = {
  pause?: () => void;
  play?: (startFrame?: number, endFrame?: number) => void;
  setSpeed?: (speed: number) => void;
};

function SystemBlobAnimationComponent({
  size = 196,
  lottieRef,
  startDelayMs = 0,
  rotationDeg = 0,
  staticFrame = false,
}: {
  size?: number;
  lottieRef?: { current: SystemBlobAnimationHandle | null };
  startDelayMs?: number;
  rotationDeg?: number;
  staticFrame?: boolean;
}) {
  const innerRef = useRef<SystemBlobAnimationHandle | null>(null);
  const LottieView = useMemo<any>(() => {
    try {
      return (
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- Avoid crashing startup if native Lottie isn't ready yet.
        require("lottie-react-native").default
      );
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    const targetRef = innerRef.current;
    if (!targetRef || staticFrame) {
      return;
    }

    if (startDelayMs <= 0) {
      targetRef.play?.();
      return;
    }

    targetRef.pause?.();
    const timerId = setTimeout(
      () => {
        targetRef.play?.();
      },
      Math.max(0, startDelayMs),
    );

    return () => clearTimeout(timerId);
  }, [startDelayMs, staticFrame]);

  const assignRef = useCallback(
    (instance: SystemBlobAnimationHandle | null) => {
      innerRef.current = instance;
      if (lottieRef) {
        lottieRef.current = instance;
      }
    },
    [lottieRef],
  );

  if (!LottieView) {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: "rgba(255,255,255,0.02)",
        }}
      />
    );
  }

  return (
    <LottieView
      autoPlay={!staticFrame && startDelayMs === 0}
      loop={!staticFrame}
      ref={assignRef as never}
      source={systemBlob}
      style={{
        width: size,
        height: size,
        transform: [{ rotate: `${rotationDeg}deg` }],
      }}
    />
  );
}

export const SystemBlobAnimation = memo(SystemBlobAnimationComponent);
