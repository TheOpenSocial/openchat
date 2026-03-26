import { BlurView } from "expo-blur";
import {
  GlassView,
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
} from "expo-glass-effect";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  StyleSheet,
  TextInputContentSizeChangeEventData,
  View,
} from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { type AppLocale, t } from "../i18n/strings";
import { appTheme } from "../theme";
import { cn } from "../lib/cn";
import { ComposerInput } from "../components/ComposerInput";
import { VoiceMicButton } from "../components/VoiceMicButton";

type OpenChatComposerProps = {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void | Promise<void>;
  sending: boolean;
  canSend: boolean;
  placeholder?: string;
  maxLength?: number;
  inputTestID?: string;
  sendTestID?: string;
  sendAccessibilityLabel?: string;
  locale: AppLocale;
  voiceEnabled?: boolean;
  onVoiceTranscript?: (line: string) => void;
};

const INPUT_LINE_HEIGHT = 25;
const INPUT_BASE_HEIGHT = INPUT_LINE_HEIGHT;
const INPUT_MAX_LINES = 6;
const INPUT_MAX_HEIGHT = INPUT_LINE_HEIGHT * INPUT_MAX_LINES;
const INPUT_CONTAINER_VERTICAL_PADDING = 12;

function supportsLiquidGlass(): boolean {
  if (Platform.OS !== "ios") {
    return false;
  }

  try {
    return isLiquidGlassAvailable() && isGlassEffectAPIAvailable();
  } catch {
    return false;
  }
}

/**
 * Anchored composer: minimal, multiline, premium dark field.
 */
export function OpenChatComposer({
  canSend,
  inputTestID,
  locale,
  maxLength = 2000,
  onChangeText,
  onSend,
  onVoiceTranscript,
  placeholder,
  sendAccessibilityLabel,
  sendTestID,
  sending,
  value,
  voiceEnabled = true,
}: OpenChatComposerProps) {
  const [focused, setFocused] = useState(false);
  const [inputHeight, setInputHeight] = useState(INPUT_BASE_HEIGHT);
  const showActive = canSend && !sending;
  const effectiveMultiline = true;
  const effectivePlaceholder =
    placeholder ?? t("openChatComposerPlaceholder", locale);
  const effectiveSendAccessibilityLabel =
    sendAccessibilityLabel ?? t("openChatSendMessage", locale);
  const glassAvailable = useMemo(() => supportsLiquidGlass(), []);
  const emphasis = useSharedValue(0);

  useEffect(() => {
    emphasis.value = withTiming(focused || showActive ? 1 : 0, {
      duration: focused ? 220 : 180,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
    });
  }, [emphasis, focused, showActive]);

  const shellStyle = useAnimatedStyle(() => {
    const surfaceOpacity = glassAvailable
      ? interpolate(emphasis.value, [0, 1], [0.04, 0.08])
      : interpolate(emphasis.value, [0, 1], [0.82, 1]);

    const shadowOpacity = interpolate(emphasis.value, [0, 1], [0.1, 0.16]);

    return {
      backgroundColor: glassAvailable
        ? `rgba(6,8,11,${surfaceOpacity})`
        : `rgba(8,10,14,${0.14 * surfaceOpacity})`,

      shadowColor: "#000000",
      shadowOffset: { width: 0, height: 18 },
      shadowOpacity,
      shadowRadius: 28,
      transform: [
        {
          translateY: 0,
        },
      ],
    };
  });

  const sendButtonStyle = useAnimatedStyle(() => ({
    transform: [
      {
        scale: withTiming(showActive ? 1 : 0.94, {
          duration: 180,
          easing: Easing.out(Easing.cubic),
        }),
      },
    ],
  }));

  const mergeVoice = (line: string) => {
    onVoiceTranscript?.(line);
    const next = value.trim().length > 0 ? `${value.trim()} ${line}` : line;
    onChangeText(next);
  };

  const handleContentSizeChange = (
    event: NativeSyntheticEvent<TextInputContentSizeChangeEventData>,
  ) => {
    if (!effectiveMultiline) {
      return;
    }
    const measured = Math.ceil(event.nativeEvent.contentSize.height);
    const clamped = Math.max(
      INPUT_BASE_HEIGHT,
      Math.min(INPUT_MAX_HEIGHT, measured),
    );
    setInputHeight((current) => (current === clamped ? current : clamped));
  };

  useEffect(() => {
    if (!effectiveMultiline) {
      return;
    }

    if (value.trim().length === 0) {
      setInputHeight(INPUT_BASE_HEIGHT);
      return;
    }

    const fallbackLines = value.split("\n").length;
    const fallbackHeight = Math.max(
      INPUT_BASE_HEIGHT,
      Math.min(INPUT_MAX_HEIGHT, fallbackLines * INPUT_LINE_HEIGHT),
    );
    setInputHeight((current) =>
      current === fallbackHeight ? current : fallbackHeight,
    );
  }, [effectiveMultiline, value]);

  useEffect(() => {
    if (value.trim().length === 0 && !focused) {
      setInputHeight(INPUT_BASE_HEIGHT);
    }
  }, [focused, value]);

  return (
    <Animated.View className="overflow-hidden px-4 py-4" style={shellStyle}>
      {glassAvailable ? (
        <GlassView
          colorScheme="dark"
          glassEffectStyle="clear"
          isInteractive
          style={{
            ...StyleSheet.absoluteFill,
            backgroundColor: "rgba(7,9,12,0.015)",
            borderRadius: 28,
            padding: 20,
          }}
        />
      ) : (
        <BlurView
          intensity={28}
          style={StyleSheet.absoluteFillObject}
          tint="dark"
        />
      )}
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: glassAvailable
              ? "rgba(7,9,12,0.015)"
              : "rgba(7,9,12,0.08)",
          },
        ]}
      />
      <View className="gap-2">
        <ComposerInput
          className="px-0 py-0 text-[18px] leading-[25px] text-white/96"
          containerClassName={cn(
            "min-w-0 border-0 bg-transparent px-2.5 py-1.5",
          )}
          containerStyle={{
            minHeight: inputHeight + INPUT_CONTAINER_VERTICAL_PADDING,
          }}
          editable={!sending}
          maxLength={maxLength}
          multiline
          onBlur={() => setFocused(false)}
          onChangeText={onChangeText}
          onContentSizeChange={handleContentSizeChange}
          onFocus={() => setFocused(true)}
          placeholder={effectivePlaceholder}
          placeholderTextColor="rgba(255,255,255,0.4)"
          scrollEnabled={inputHeight >= INPUT_MAX_HEIGHT}
          style={{
            minHeight: inputHeight,
            lineHeight: INPUT_LINE_HEIGHT,
            margin: 0,
            paddingBottom: 0,
            paddingTop: 0,
          }}
          testID={inputTestID}
          value={value}
        />
        <View className="flex-row items-center justify-between px-1 pb-0.5">
          <View className="flex-row items-center gap-2">
            <View className="h-9 flex-row items-center justify-center rounded-full bg-white/[0.06] px-3">
              <Ionicons
                color="rgba(255,255,255,0.8)"
                name="flash-outline"
                size={14}
              />
              <View className="w-1.5" />
              <Animated.Text className="text-[14px] font-medium text-white/80">
                Auto
              </Animated.Text>
            </View>
          </View>
          <View className="flex-row items-center gap-1.5">
            {voiceEnabled ? (
              <View className="h-11 w-11 items-center justify-center overflow-hidden rounded-full">
                {glassAvailable ? (
                  <GlassView
                    colorScheme="dark"
                    glassEffectStyle="clear"
                    isInteractive
                    tintColor="rgba(255,255,255,0.22)"
                    style={{
                      ...StyleSheet.absoluteFill,
                      borderRadius: 100,
                    }}
                  />
                ) : (
                  <BlurView
                    intensity={34}
                    style={StyleSheet.absoluteFillObject}
                    tint="dark"
                  />
                )}
                <View
                  pointerEvents="none"
                  style={[
                    StyleSheet.absoluteFillObject,
                    {
                      backgroundColor: glassAvailable
                        ? "rgba(255,255,255,0.02)"
                        : "rgba(255,255,255,0.08)",
                      borderColor: glassAvailable
                        ? "transparent"
                        : "rgba(255,255,255,0.18)",
                      borderWidth: glassAvailable ? 0 : 1,
                    },
                  ]}
                />
                <VoiceMicButton
                  className="mb-0 h-11 w-11 rounded-full bg-transparent"
                  disabled={sending}
                  iconColorActive="#ffffff"
                  iconColorIdle="rgba(255,255,255,0.62)"
                  iconSize={18}
                  onFinalTranscript={mergeVoice}
                  voiceEnabled={voiceEnabled}
                />
              </View>
            ) : null}
            <Animated.View style={sendButtonStyle}>
              <View className="h-11 w-11 overflow-hidden rounded-full">
                {glassAvailable ? (
                  <GlassView
                    colorScheme="dark"
                    glassEffectStyle="clear"
                    isInteractive
                    style={{
                      ...StyleSheet.absoluteFill,
                      borderRadius: 100,
                    }}
                    tintColor={
                      showActive
                        ? "rgba(255,255,255,0.28)"
                        : "rgba(255,255,255,0.2)"
                    }
                  />
                ) : (
                  <BlurView
                    intensity={34}
                    style={StyleSheet.absoluteFillObject}
                    tint="dark"
                  />
                )}
                <View
                  pointerEvents="none"
                  style={[
                    StyleSheet.absoluteFillObject,
                    {
                      backgroundColor: showActive
                        ? glassAvailable
                          ? "rgba(255,255,255,0.04)"
                          : "rgba(255,255,255,0.14)"
                        : glassAvailable
                          ? "rgba(255,255,255,0.02)"
                          : "rgba(255,255,255,0.08)",
                    },
                  ]}
                />
                <Pressable
                  accessibilityLabel={effectiveSendAccessibilityLabel}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !canSend || sending }}
                  android_ripple={
                    Platform.OS === "android" && showActive
                      ? { color: "rgba(255,255,255,0.16)", borderless: true }
                      : undefined
                  }
                  className={cn(
                    "h-11 w-11 items-center border-0 justify-center bg-transparent",
                  )}
                  disabled={!canSend || sending}
                  hitSlop={8}
                  onPress={() => void onSend()}
                  style={({ pressed }) => ({
                    opacity:
                      pressed && !sending ? appTheme.motion.pressOpacity : 1,
                  })}
                >
                  <View
                    collapsable={false}
                    pointerEvents="none"
                    testID={sendTestID}
                  >
                    {sending ? (
                      <ActivityIndicator color="#ffffff" size="small" />
                    ) : (
                      <Ionicons
                        color={
                          showActive ? "#ffffff" : "rgba(255,255,255,0.52)"
                        }
                        name="arrow-up"
                        size={20}
                      />
                    )}
                  </View>
                </Pressable>
              </View>
            </Animated.View>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}
