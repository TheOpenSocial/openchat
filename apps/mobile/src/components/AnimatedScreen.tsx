import { PropsWithChildren, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, View } from "react-native";

import { appTheme } from "../theme";

interface AnimatedScreenProps extends PropsWithChildren {
  screenKey: string;
}

export function AnimatedScreen({ children, screenKey }: AnimatedScreenProps) {
  const [reduceMotion, setReduceMotion] = useState(false);
  const previousKeyRef = useRef(screenKey);
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const scale = useRef(new Animated.Value(1)).current;

  const directionalOrder = ["chats", "home", "profile"];

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
      translateX.setValue(0);
      translateY.setValue(0);
      opacity.setValue(1);
      scale.setValue(1);
      previousKeyRef.current = screenKey;
      return;
    }

    const previousKey = previousKeyRef.current;
    const previousIndex = directionalOrder.indexOf(previousKey);
    const nextIndex = directionalOrder.indexOf(screenKey);
    const isDirectionalTabSwitch = previousIndex !== -1 && nextIndex !== -1;
    const direction =
      isDirectionalTabSwitch && previousIndex !== nextIndex
        ? nextIndex > previousIndex
          ? 1
          : -1
        : 0;

    translateX.setValue(isDirectionalTabSwitch ? direction * 18 : 0);
    translateY.setValue(isDirectionalTabSwitch ? 0 : 10);
    opacity.setValue(0.78);
    scale.setValue(0.992);

    const easing = Easing.out(Easing.cubic);
    const duration = appTheme.motion.screenEnterMs;
    Animated.parallel([
      Animated.timing(translateX, {
        toValue: 0,
        duration,
        easing,
        useNativeDriver: true,
      }),
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
      Animated.timing(scale, {
        toValue: 1,
        duration: Math.max(200, duration),
        easing,
        useNativeDriver: true,
      }),
    ]).start();
    previousKeyRef.current = screenKey;
  }, [opacity, reduceMotion, scale, screenKey, translateX, translateY]);

  if (reduceMotion) {
    return (
      <View className="flex-1" style={{ flex: 1 }}>
        {children}
      </View>
    );
  }

  return (
    <Animated.View
      style={{
        flex: 1,
        opacity,
        transform: [{ translateX }, { translateY }, { scale }],
      }}
    >
      {children}
    </Animated.View>
  );
}
