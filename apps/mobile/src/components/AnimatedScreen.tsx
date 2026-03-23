import { PropsWithChildren, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, View } from "react-native";

import { appTheme } from "../theme";

interface AnimatedScreenProps extends PropsWithChildren {
  screenKey: string;
}

export function AnimatedScreen({ children, screenKey }: AnimatedScreenProps) {
  const [reduceMotion, setReduceMotion] = useState(false);
  const translateY = useRef(new Animated.Value(10)).current;
  const opacity = useRef(new Animated.Value(1)).current;

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
      opacity.setValue(1);
      return;
    }

    translateY.setValue(10);
    opacity.setValue(0.72);

    const easing = Easing.out(Easing.cubic);
    const duration = appTheme.motion.screenEnterMs;
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: 0,
        duration,
        easing,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: Math.max(180, duration - 20),
        easing,
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, reduceMotion, screenKey, translateY]);

  if (reduceMotion) {
    return <View className="flex-1">{children}</View>;
  }

  return (
    <Animated.View
      style={{
        flex: 1,
        opacity,
        transform: [{ translateY }],
      }}
    >
      {children}
    </Animated.View>
  );
}
