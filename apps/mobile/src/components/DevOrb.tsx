import Ionicons from "@expo/vector-icons/Ionicons";
import {
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
} from "expo-glass-effect";
import { useEffect, useMemo, useRef } from "react";
import {
  Animated,
  PanResponder,
  Platform,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { appTheme } from "../theme";

interface DevOrbProps {
  visible: boolean;
  unlocked: boolean;
  open: boolean;
  bottomOffset: number;
  onUnlock: () => void;
  onToggle: () => void;
  onLock: () => void;
  onCreateDmSandbox: () => Promise<void>;
  onCreateGroupSandbox: () => Promise<void>;
  onSyncChats: () => void;
  onResetAgent: () => void;
  onSimulateHomeReconnect: () => void;
}

export function DevOrb({
  bottomOffset,
  onCreateDmSandbox,
  onCreateGroupSandbox,
  onLock,
  onResetAgent,
  onSimulateHomeReconnect,
  onSyncChats,
  onToggle,
  onUnlock,
  open,
  unlocked,
  visible,
}: DevOrbProps) {
  const ORB_SIZE = 56;
  const SAFE_MARGIN = 12;
  const { height, width } = useWindowDimensions();
  const minX = SAFE_MARGIN;
  const maxX = Math.max(SAFE_MARGIN, width - ORB_SIZE - SAFE_MARGIN);
  const minY = SAFE_MARGIN;
  const maxY = Math.max(SAFE_MARGIN, height - ORB_SIZE - SAFE_MARGIN);
  const initialX = Math.max(SAFE_MARGIN, width - ORB_SIZE - 16);
  const initialY = Math.min(
    maxY,
    Math.max(minY, height - bottomOffset - ORB_SIZE),
  );

  const position = useRef(
    new Animated.ValueXY({ x: initialX, y: initialY }),
  ).current;
  const dragOriginRef = useRef({ x: initialX, y: initialY });
  const currentRef = useRef({ x: initialX, y: initialY });
  const initializedRef = useRef(false);

  useEffect(() => {
    const sub = position.addListener((value) => {
      currentRef.current = {
        x: value.x,
        y: value.y,
      };
    });
    return () => {
      position.removeListener(sub);
    };
  }, [position]);

  useEffect(() => {
    const next = initializedRef.current
      ? {
          x: Math.min(maxX, Math.max(minX, currentRef.current.x)),
          y: Math.min(maxY, Math.max(minY, currentRef.current.y)),
        }
      : {
          x: initialX,
          y: initialY,
        };
    initializedRef.current = true;
    dragOriginRef.current = next;
    currentRef.current = next;
    position.setValue(next);
  }, [initialX, initialY, maxX, maxY, minX, minY, position]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          Math.abs(gestureState.dx) > 3 || Math.abs(gestureState.dy) > 3,
        onPanResponderGrant: () => {
          dragOriginRef.current = { ...currentRef.current };
        },
        onPanResponderMove: (_, gestureState) => {
          const nextX = Math.min(
            maxX,
            Math.max(minX, dragOriginRef.current.x + gestureState.dx),
          );
          const nextY = Math.min(
            maxY,
            Math.max(minY, dragOriginRef.current.y + gestureState.dy),
          );
          position.setValue({ x: nextX, y: nextY });
        },
        onPanResponderRelease: () => {
          dragOriginRef.current = { ...currentRef.current };
        },
        onPanResponderTerminate: () => {
          dragOriginRef.current = { ...currentRef.current };
        },
      }),
    [maxX, maxY, minX, minY, position],
  );

  const glassDiagnostics = useMemo(() => {
    const diagnostics = {
      apiAvailable: false,
      liquidGlassAvailable: false,
      platform: Platform.OS,
    };

    if (Platform.OS !== "ios") {
      return diagnostics;
    }

    try {
      diagnostics.apiAvailable = isGlassEffectAPIAvailable();
      diagnostics.liquidGlassAvailable = isLiquidGlassAvailable();
    } catch {
      /* ignored: fallback remains false */
    }

    return diagnostics;
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <Animated.View
      className="z-30 items-end"
      {...panResponder.panHandlers}
      style={{
        position: "absolute",
        transform: position.getTranslateTransform(),
      }}
    >
      {open ? (
        <View className="mb-3 w-[240px] rounded-3xl border border-white/15 bg-[#0b0e13] px-3.5 py-3 shadow-lg shadow-black/50">
          <Text className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/40">
            Dev Tools
          </Text>
          <View className="mb-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
            <Text className="text-[11px] font-semibold uppercase tracking-[0.06em] text-white/45">
              Runtime
            </Text>
            <Text className="mt-1 text-[12px] text-white/85">
              Platform: {glassDiagnostics.platform}
            </Text>
            <Text className="mt-0.5 text-[12px] text-white/85">
              Glass API: {glassDiagnostics.apiAvailable ? "available" : "off"}
            </Text>
            <Text className="mt-0.5 text-[12px] text-white/85">
              Liquid Glass:{" "}
              {glassDiagnostics.liquidGlassAvailable ? "on" : "fallback"}
            </Text>
          </View>
          {unlocked ? (
            <>
              <Pressable
                className="mb-2 rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-2.5"
                onPress={onCreateDmSandbox}
              >
                <Text className="text-[12px] font-semibold text-white/90">
                  Create DM Sandbox
                </Text>
              </Pressable>
              <Pressable
                className="mb-2 rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-2.5"
                onPress={onCreateGroupSandbox}
              >
                <Text className="text-[12px] font-semibold text-white/90">
                  Create Group Sandbox
                </Text>
              </Pressable>
              <Pressable
                className="mb-2 rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-2.5"
                onPress={onSyncChats}
              >
                <Text className="text-[12px] font-semibold text-white/90">
                  Sync Chats
                </Text>
              </Pressable>
              <Pressable
                className="rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-2.5"
                onPress={onResetAgent}
              >
                <Text className="text-[12px] font-semibold text-white/90">
                  Reset Agent
                </Text>
              </Pressable>
              <Pressable
                className="mt-2 rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-2.5"
                onPress={onSimulateHomeReconnect}
              >
                <Text className="text-[12px] font-semibold text-white/90">
                  Simulate Home Reconnect
                </Text>
              </Pressable>
              <Pressable
                className="mt-2 rounded-2xl border border-white/10 bg-black/30 px-3 py-2.5"
                onPress={onLock}
              >
                <Text className="text-[12px] font-semibold text-white/60">
                  Lock Dev Tools
                </Text>
              </Pressable>
            </>
          ) : (
            <Text className="text-[12px] text-white/55">
              Hold the orb to unlock dev actions.
            </Text>
          )}
        </View>
      ) : null}
      <Pressable
        accessibilityLabel="Developer tools orb"
        accessibilityRole="button"
        className="h-14 w-14 items-center justify-center rounded-full border border-white/20 bg-[#10151d]"
        delayLongPress={420}
        onLongPress={onUnlock}
        onPress={onToggle}
        style={({ pressed }) => ({
          opacity: pressed ? appTheme.motion.pressOpacity : 1,
        })}
        testID="dev-orb-toggle"
      >
        <Ionicons
          color={unlocked ? "#f5f5f5" : "rgba(245,245,245,0.7)"}
          name={unlocked ? "construct" : "lock-closed"}
          size={22}
        />
      </Pressable>
    </Animated.View>
  );
}
