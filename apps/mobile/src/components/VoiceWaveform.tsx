import { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, View } from "react-native";

interface VoiceWaveformProps {
  level: number;
  listening: boolean;
  bars?: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function VoiceWaveform({
  bars = 19,
  level,
  listening,
}: VoiceWaveformProps) {
  const pulse = useRef(new Animated.Value(0)).current;
  const halo = useRef(new Animated.Value(0)).current;
  const levels = useRef(
    Array.from({ length: bars }, () => new Animated.Value(0.12)),
  ).current;

  const profile = useMemo(() => {
    const center = (bars - 1) / 2;
    return Array.from({ length: bars }, (_, index) => {
      const distance = Math.abs(index - center);
      const falloff = 1 - distance / (center + 1);
      return 0.25 + falloff * 0.95;
    });
  }, [bars]);

  useEffect(() => {
    if (!listening) {
      pulse.stopAnimation();
      pulse.setValue(0);
      halo.stopAnimation();
      halo.setValue(0);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: false,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: false,
        }),
      ]),
    );

    const haloLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(halo, {
          toValue: 1,
          duration: 1800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: false,
        }),
        Animated.timing(halo, {
          toValue: 0,
          duration: 1800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: false,
        }),
      ]),
    );

    loop.start();
    haloLoop.start();
    return () => {
      loop.stop();
      haloLoop.stop();
    };
  }, [halo, listening, pulse]);

  useEffect(() => {
    const normalized = clamp((level + 2) / 12, 0, 1);

    const animations = levels.map((animatedLevel, index) => {
      const edgeSoftener =
        0.88 + Math.cos((index / (bars - 1)) * Math.PI) * 0.12;
      const target = listening
        ? 0.1 + normalized * profile[index] * edgeSoftener
        : 0.07 + profile[index] * 0.015;

      return Animated.timing(animatedLevel, {
        toValue: clamp(target, 0.08, 1),
        duration: listening ? 90 : 180,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      });
    });

    Animated.parallel(animations).start();
  }, [level, levels, listening, profile]);

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        alignItems: "center",
        height: 46,
        justifyContent: "center",
        width: 220,
      }}
    >
      <Animated.View
        style={{
          backgroundColor: "rgba(13,13,13,0.08)",
          borderRadius: 999,
          height: 32,
          opacity: halo.interpolate({
            inputRange: [0, 1],
            outputRange: [0.18, 0.32],
          }),
          position: "absolute",
          transform: [
            {
              scaleX: halo.interpolate({
                inputRange: [0, 1],
                outputRange: [0.82, 1.05],
              }),
            },
            {
              scaleY: halo.interpolate({
                inputRange: [0, 1],
                outputRange: [0.9, 1.08],
              }),
            },
          ],
          width: 96,
        }}
      />
      <View
        style={{
          backgroundColor: "rgba(13,13,13,0.12)",
          borderRadius: 999,
          height: 1,
          position: "absolute",
          width: 196,
        }}
      />
      <View
        style={{
          alignItems: "center",
          flexDirection: "row",
          gap: 4,
          height: 40,
          justifyContent: "center",
        }}
      >
        {levels.map((animatedLevel, index) => {
          const centerDistance =
            Math.abs(index - (bars - 1) / 2) / ((bars - 1) / 2);
          const opacity = pulse.interpolate({
            inputRange: [0, 1],
            outputRange: [
              listening ? 0.36 + (1 - centerDistance) * 0.1 : 0.22,
              listening ? 0.82 + (1 - centerDistance) * 0.12 : 0.32,
            ],
          });

          return (
            <Animated.View
              key={index}
              style={{
                backgroundColor: "rgba(13,13,13,0.92)",
                borderRadius: 999,
                height: animatedLevel.interpolate({
                  inputRange: [0, 1],
                  outputRange: [5, 30],
                }),
                opacity,
                width: index % 2 === 0 ? 3 : 2.5,
              }}
            />
          );
        })}
      </View>
    </View>
  );
}
