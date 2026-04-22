import { PropsWithChildren, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, View } from "react-native";

import { appTheme } from "../theme";

type RouteTransitionProps = PropsWithChildren<{
  animated?: boolean;
  routeKey: string;
}>;

const directionalOrder = ["chats", "home", "profile"];

export function RouteTransition({
  animated = true,
  children,
  routeKey,
}: RouteTransitionProps) {
  const [reduceMotion, setReduceMotion] = useState(true);
  const previousKeyRef = useRef(routeKey);
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const scale = useRef(new Animated.Value(1)).current;

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
    if (!animated || reduceMotion) {
      translateX.setValue(0);
      translateY.setValue(0);
      opacity.setValue(1);
      scale.setValue(1);
      previousKeyRef.current = routeKey;
      return;
    }

    const previousKey = previousKeyRef.current;
    const previousIndex = directionalOrder.indexOf(previousKey);
    const nextIndex = directionalOrder.indexOf(routeKey);
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
    previousKeyRef.current = routeKey;
  }, [
    animated,
    opacity,
    reduceMotion,
    routeKey,
    scale,
    translateX,
    translateY,
  ]);

  if (!animated || reduceMotion) {
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
