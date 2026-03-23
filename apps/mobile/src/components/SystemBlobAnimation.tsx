import { useMemo } from "react";
import { View } from "react-native";

import systemBlob from "../../assets/brand/gradient-blob.json";

export function SystemBlobAnimation({ size = 196 }: { size?: number }) {
  const LottieView = useMemo(() => {
    try {
      return (
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- Load only when rendered to avoid native startup crashes.
        require("lottie-react-native")
          .default as typeof import("lottie-react-native").default
      );
    } catch {
      return null;
    }
  }, []);

  if (!LottieView) {
    return (
      <View style={{ width: size, height: size, borderRadius: size / 2 }} />
    );
  }

  return (
    <LottieView
      autoPlay
      loop
      source={systemBlob}
      style={{ width: size, height: size }}
    />
  );
}
