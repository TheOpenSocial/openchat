import { LinearGradient } from "expo-linear-gradient";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Modal, StyleSheet, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

import { SystemBlobAnimation } from "./SystemBlobAnimation";
import { TypingText } from "./TypingText";

type LoadingModalProps = {
  visible: boolean;
  message: string;
};

const ORBITAL_DURATION_MS = 4600;
const ORBITAL_RADIUS_X = 72;
const ORBITAL_RADIUS_Y = 24;
const FULL_ROTATION_DEG = 360;
const ORBITAL_EASING = Easing.bezier(0.22, 0.82, 0.42, 0.98);
const MODAL_FADE_IN_MS = 220;
const MODAL_FADE_OUT_MS = 260;

const OrbitingBlob = memo(function OrbitingBlob({
  phaseOffsetDeg,
  rotationDeg,
  startDelayMs,
  progress,
}: {
  phaseOffsetDeg: number;
  rotationDeg: number;
  startDelayMs: number;
  progress: SharedValue<number>;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    const angleDeg = progress.value + phaseOffsetDeg;
    const angleRad = (angleDeg * Math.PI) / 180;
    const depth = Math.cos(angleRad);
    const translateX = Math.sin(angleRad) * ORBITAL_RADIUS_X;
    const translateY = depth * ORBITAL_RADIUS_Y;

    return {
      opacity: interpolate(depth, [-1, 1], [0.5, 1]),
      transform: [
        { translateX },
        { translateY },
        { scale: interpolate(depth, [-1, 1], [0.78, 1.22]) },
      ],
    };
  });

  return (
    <Animated.View className="absolute" style={animatedStyle}>
      <SystemBlobAnimation
        rotationDeg={rotationDeg}
        size={148}
        startDelayMs={startDelayMs}
      />
    </Animated.View>
  );
});

export function LoadingModal({ visible, message }: LoadingModalProps) {
  const orbitProgress = useSharedValue(0);
  const opacity = useSharedValue(0);
  const [renderVisible, setRenderVisible] = useState(visible);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blobConfigs = useMemo(
    () =>
      Array.from({ length: 3 }, (_, index) => ({
        id: index,
        phaseOffsetDeg:
          index * (FULL_ROTATION_DEG / 3) + (Math.random() * 20 - 10),
        rotationDeg: Math.round(Math.random() * 360),
        startDelayMs: Math.floor(Math.random() * 1800),
      })),
    [],
  );

  useEffect(() => {
    orbitProgress.value = withRepeat(
      withTiming(FULL_ROTATION_DEG, {
        duration: ORBITAL_DURATION_MS,
        easing: ORBITAL_EASING,
      }),
      -1,
      false,
    );

    return () => {
      cancelAnimation(orbitProgress);
    };
  }, [orbitProgress]);

  useEffect(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }

    if (visible) {
      setRenderVisible(true);
      opacity.value = withTiming(1, {
        duration: MODAL_FADE_IN_MS,
        easing: Easing.out(Easing.cubic),
      });
      return;
    }

    opacity.value = withTiming(0, {
      duration: MODAL_FADE_OUT_MS,
      easing: Easing.out(Easing.cubic),
    });
    hideTimeoutRef.current = setTimeout(() => {
      hideTimeoutRef.current = null;
      setRenderVisible(false);
    }, MODAL_FADE_OUT_MS);
  }, [opacity, visible]);

  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, []);

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  if (!renderVisible) {
    return null;
  }

  return (
    <Modal
      animationType="none"
      onRequestClose={() => {}}
      statusBarTranslucent
      transparent
      visible={renderVisible}
    >
      <Animated.View className="flex-1 bg-black" style={overlayStyle}>
        <LinearGradient
          colors={["#000000", "#040404", "#000000"]}
          end={{ x: 0.5, y: 1 }}
          start={{ x: 0.5, y: 0 }}
          style={StyleSheet.absoluteFillObject}
        />

        <View className="flex-1 items-center justify-center px-6">
          <View className="h-[220px] w-[280px] items-center justify-center">
            {blobConfigs.map((config) => (
              <OrbitingBlob
                key={config.id}
                phaseOffsetDeg={config.phaseOffsetDeg}
                progress={orbitProgress}
                rotationDeg={config.rotationDeg}
                startDelayMs={config.startDelayMs}
              />
            ))}
          </View>
        </View>

        <View className="absolute inset-x-0 bottom-16 items-center px-8">
          <TypingText
            className="max-w-[320px] text-center text-[15px] leading-[21px] text-white/82"
            cursor
            text={message}
          />
        </View>
      </Animated.View>
    </Modal>
  );
}
