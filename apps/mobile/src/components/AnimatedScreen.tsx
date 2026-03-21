import { PropsWithChildren, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, View } from "react-native";

import { appTheme } from "../theme";

interface AnimatedScreenProps extends PropsWithChildren {
  screenKey: string;
}

export function AnimatedScreen({ children, screenKey }: AnimatedScreenProps) {
  const [reduceMotion, setReduceMotion] = useState(false);
  const translateY = useRef(new Animated.Value(10)).current;

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduceMotion)
      .catch(() => {});

    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduceMotion,
    );

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      translateY.setValue(0);
      return;
    }

    translateY.setValue(10);

    const easing = Easing.out(Easing.cubic);
    const duration = appTheme.motion.screenEnterMs;
    // No opacity fade: expo-video native surface often ignores parent opacity, so UI looked gone.
    Animated.timing(translateY, {
      toValue: 0,
      duration,
      easing,
      useNativeDriver: true,
    }).start();
  }, [reduceMotion, screenKey, translateY]);

  if (reduceMotion) {
    return <View className="flex-1">{children}</View>;
  }

  return (
    <Animated.View
      style={{
        flex: 1,
        transform: [{ translateY }],
      }}
    >
      {children}
    </Animated.View>
  );
}
