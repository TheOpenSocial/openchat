import { BlurView } from "expo-blur";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
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
  e2eSubmitOnReturn?: boolean;
};

/**
 * Anchored composer: minimal, multiline, premium dark field.
 */
export function OpenChatComposer({
  canSend,
  e2eSubmitOnReturn = false,
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
  const showActive = canSend && !sending;
  const effectiveMultiline = e2eSubmitOnReturn ? false : true;
  const effectivePlaceholder =
    placeholder ?? t("openChatComposerPlaceholder", locale);
  const effectiveSendAccessibilityLabel =
    sendAccessibilityLabel ?? t("openChatSendMessage", locale);
  const emphasis = useSharedValue(0);

  useEffect(() => {
    emphasis.value = withTiming(focused || showActive ? 1 : 0, {
      duration: focused ? 220 : 180,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
    });
  }, [emphasis, focused, showActive]);

  const shellStyle = useAnimatedStyle(() => {
    const borderOpacity = interpolate(emphasis.value, [0, 1], [0.05, 0.1]);
    const surfaceOpacity = interpolate(emphasis.value, [0, 1], [0.82, 1]);
    const shadowOpacity = interpolate(emphasis.value, [0, 1], [0.1, 0.16]);

    return {
      backgroundColor: `rgba(8,10,14,${0.14 * surfaceOpacity})`,
      borderColor: `rgba(255,255,255,${borderOpacity})`,
      shadowColor: "#000000",
      shadowOffset: { width: 0, height: 18 },
      shadowOpacity,
      shadowRadius: 28,
      transform: [
        {
          translateY: interpolate(emphasis.value, [0, 1], [0, -1]),
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

  return (
    <Animated.View
      className="overflow-hidden rounded-[30px] border px-2.5 py-2"
      style={shellStyle}
    >
      <BlurView
        intensity={28}
        style={StyleSheet.absoluteFillObject}
        tint="dark"
      />
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFillObject,
          { backgroundColor: "rgba(7,9,12,0.08)" },
        ]}
      />
      <View className="flex-row items-end gap-2">
        <ComposerInput
          blurOnSubmit={e2eSubmitOnReturn}
          className="px-0 py-0 text-[17px] leading-[25px] text-white/96"
          containerClassName={cn(
            "min-h-[60px] min-w-0 flex-1 border-0 bg-transparent px-3.5 py-3.5",
          )}
          editable={!sending}
          maxLength={maxLength}
          multiline={effectiveMultiline}
          onBlur={() => setFocused(false)}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          onSubmitEditing={
            e2eSubmitOnReturn
              ? () => {
                  if (canSend && !sending) {
                    void onSend();
                  }
                }
              : undefined
          }
          placeholder={effectivePlaceholder}
          placeholderTextColor="rgba(255,255,255,0.34)"
          returnKeyType={e2eSubmitOnReturn ? "send" : "default"}
          testID={inputTestID}
          value={value}
        />
        <View className="flex-row items-center gap-1.5 pb-1">
          {voiceEnabled ? (
            <View className="h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-white/[0.04]">
              <VoiceMicButton
                className="mb-0 h-11 w-11 rounded-full bg-transparent"
                disabled={sending}
                iconColorActive="#ffffff"
                iconColorIdle="rgba(255,255,255,0.52)"
                iconSize={18}
                onFinalTranscript={mergeVoice}
                voiceEnabled={voiceEnabled}
              />
            </View>
          ) : null}
          <Animated.View style={sendButtonStyle}>
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
                "h-11 w-11 items-center justify-center rounded-full",
                showActive ? "bg-white" : "bg-white/[0.08]",
              )}
              disabled={!canSend || sending}
              hitSlop={8}
              onPress={() => void onSend()}
              style={({ pressed }) => ({
                opacity: pressed && !sending ? appTheme.motion.pressOpacity : 1,
              })}
            >
              <View
                collapsable={false}
                pointerEvents="none"
                testID={sendTestID}
              >
                {sending ? (
                  <ActivityIndicator color="#111111" size="small" />
                ) : (
                  <Ionicons
                    color={showActive ? "#111111" : "rgba(255,255,255,0.34)"}
                    name="arrow-up"
                    size={20}
                  />
                )}
              </View>
            </Pressable>
          </Animated.View>
        </View>
      </View>
    </Animated.View>
  );
}
