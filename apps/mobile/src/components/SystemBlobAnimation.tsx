import { useMemo } from "react";
import { View } from "react-native";

import systemBlob from "../../assets/brand/gradient-blob.json";

export function SystemBlobAnimation({
  size = 196,
  lottieRef,
}: {
  size?: number;
  lottieRef?: { current: { pause?: () => void; play?: () => void } | null };
}) {
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
      autoPlay
      loop
      ref={lottieRef as never}
      source={systemBlob}
      style={{ width: size, height: size }}
    />
  );
}
