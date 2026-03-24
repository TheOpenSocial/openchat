import { useEffect, useRef } from "react";
import { Animated, Easing, Text, View } from "react-native";

import { THREAD_THINKING_MOTION } from "./runtime-constants";

type ThreadThinkingIndicatorProps = {
  label: string;
};

export function ThreadThinkingIndicator({
  label,
}: ThreadThinkingIndicatorProps) {
  const pulseA = useRef(
    new Animated.Value(THREAD_THINKING_MOTION.dotMinOpacity),
  ).current;
  const pulseB = useRef(
    new Animated.Value(THREAD_THINKING_MOTION.dotMinOpacity),
  ).current;
  const pulseC = useRef(
    new Animated.Value(THREAD_THINKING_MOTION.dotMinOpacity),
  ).current;

  useEffect(() => {
    const makePulse = (value: Animated.Value, delayMs: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delayMs),
          Animated.timing(value, {
            toValue: THREAD_THINKING_MOTION.dotMaxOpacity,
            duration: THREAD_THINKING_MOTION.pulseInDurationMs,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            toValue: THREAD_THINKING_MOTION.dotMinOpacity,
            duration: THREAD_THINKING_MOTION.pulseOutDurationMs,
            easing: Easing.in(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
      );

    const a = makePulse(pulseA, 0);
    const b = makePulse(pulseB, THREAD_THINKING_MOTION.pulseDelayMs);
    const c = makePulse(pulseC, THREAD_THINKING_MOTION.pulseDelayMs * 2);
    a.start();
    b.start();
    c.start();

    return () => {
      a.stop();
      b.stop();
      c.stop();
    };
  }, [pulseA, pulseB, pulseC]);

  return (
    <View className="mb-3 mt-1 self-start rounded-full border border-white/[0.06] bg-white/[0.03] px-3.5 py-2">
      <View className="flex-row items-center gap-2">
        <View className="flex-row items-center gap-1">
          <Animated.View
            className="h-1.5 w-1.5 rounded-full bg-white"
            style={{ opacity: pulseA }}
          />
          <Animated.View
            className="h-1.5 w-1.5 rounded-full bg-white"
            style={{ opacity: pulseB }}
          />
          <Animated.View
            className="h-1.5 w-1.5 rounded-full bg-white"
            style={{ opacity: pulseC }}
          />
        </View>
        <Text className="text-[12px] font-medium text-white/58">{label}</Text>
      </View>
    </View>
  );
}
