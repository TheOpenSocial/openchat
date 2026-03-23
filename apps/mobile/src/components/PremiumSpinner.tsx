import { useEffect, useRef } from "react";
import { Animated, Easing, View } from "react-native";

interface PremiumSpinnerProps {
  size?: number;
  color?: string;
}

export function PremiumSpinner({
  color = "rgba(255,255,255,0.82)",
  size = 18,
}: PremiumSpinnerProps) {
  const rotate = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(rotate, {
        toValue: 1,
        duration: 820,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );

    loop.start();
    return () => loop.stop();
  }, [rotate]);

  return (
    <Animated.View
      style={{
        height: size,
        transform: [
          {
            rotate: rotate.interpolate({
              inputRange: [0, 1],
              outputRange: ["0deg", "360deg"],
            }),
          },
        ],
        width: size,
      }}
    >
      <View
        style={{
          borderColor: "rgba(255,255,255,0.12)",
          borderRadius: 999,
          borderWidth: 1.6,
          height: size,
          width: size,
        }}
      />
      <View
        style={{
          borderBottomColor: "transparent",
          borderColor: color,
          borderLeftColor: "transparent",
          borderRadius: 999,
          borderWidth: 1.9,
          height: size,
          left: 0,
          position: "absolute",
          top: 0,
          width: size,
        }}
      />
    </Animated.View>
  );
}
