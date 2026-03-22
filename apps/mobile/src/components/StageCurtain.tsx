import { useEffect, useRef } from "react";
import { AccessibilityInfo, Animated, Easing, StyleSheet } from "react-native";

interface StageCurtainProps {
  visible: boolean;
}

export function StageCurtain({ visible }: StageCurtainProps) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let cancelled = false;

    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduceMotion) => {
        if (cancelled) {
          return;
        }

        if (reduceMotion) {
          opacity.setValue(visible ? 1 : 0);
          return;
        }

        Animated.timing(opacity, {
          toValue: visible ? 1 : 0,
          duration: visible ? 200 : 320,
          easing: visible
            ? Easing.out(Easing.cubic)
            : Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }).start();
      })
      .catch(() => {
        Animated.timing(opacity, {
          toValue: visible ? 1 : 0,
          duration: visible ? 200 : 320,
          easing: visible
            ? Easing.out(Easing.cubic)
            : Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }).start();
      });

    return () => {
      cancelled = true;
    };
  }, [opacity, visible]);

  return (
    <Animated.View
      pointerEvents={visible ? "auto" : "none"}
      style={[styles.curtain, { opacity }]}
    />
  );
}

const styles = StyleSheet.create({
  curtain: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#050506",
    zIndex: 9999,
  },
});
