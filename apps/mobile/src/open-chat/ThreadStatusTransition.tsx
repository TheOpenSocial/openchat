import { useEffect, useRef } from "react";
import { Animated, Easing, View } from "react-native";

import { THREAD_RUNTIME_MOTION } from "./runtime-constants";
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
    opacity.setValue(THREAD_RUNTIME_MOTION.statusTransition.fromOpacity);
    translateY.setValue(THREAD_RUNTIME_MOTION.statusTransition.fromTranslateY);
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: THREAD_RUNTIME_MOTION.statusTransition.durationMs,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: THREAD_RUNTIME_MOTION.statusTransition.durationMs,
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
