import { useEffect, useRef } from "react";
import { Animated, Easing, View } from "react-native";

import { ThreadContextStrip } from "./ThreadContextStrip";
import { ThreadThinkingIndicator } from "./ThreadThinkingIndicator";

type ThreadStatusTransitionProps = {
  contextLabel: string | null;
  hint: string | null;
  thinkingLabel: string | null;
  showThinking: boolean;
};

export function ThreadStatusTransition({
  contextLabel,
  hint,
  thinkingLabel,
  showThinking,
}: ThreadStatusTransitionProps) {
  const opacity = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const signature = `${contextLabel ?? ""}|${hint ?? ""}|${thinkingLabel ?? ""}|${showThinking ? "1" : "0"}`;

  useEffect(() => {
    opacity.setValue(0.3);
    translateY.setValue(4);
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, signature, translateY]);

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      <ThreadContextStrip hint={hint} label={contextLabel} />
      {showThinking && thinkingLabel ? (
        <View className="px-5">
          <ThreadThinkingIndicator label={thinkingLabel} />
        </View>
      ) : null}
    </Animated.View>
  );
}
