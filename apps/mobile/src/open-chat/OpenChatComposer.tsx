import Ionicons from "@expo/vector-icons/Ionicons";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  NativeSyntheticEvent,
  Pressable,
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
  topAccessory?: ReactNode;
};

const INPUT_LINE_HEIGHT = 22;
const INPUT_BASE_HEIGHT = INPUT_LINE_HEIGHT;
const INPUT_MAX_LINES = 6;
const INPUT_MAX_HEIGHT = INPUT_LINE_HEIGHT * INPUT_MAX_LINES;
const INPUT_CONTAINER_VERTICAL_PADDING = 8;

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
  topAccessory,
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
  const emphasis = useSharedValue(0);

  useEffect(() => {
    emphasis.value = withTiming(focused || showActive ? 1 : 0, {
      duration: focused ? 220 : 180,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
    });
  }, [emphasis, focused, showActive]);

  const shellStyle = useAnimatedStyle(() => {
    return {
      backgroundColor: appTheme.colors.panelStrong,
      borderColor:
        emphasis.value > 0.5
          ? appTheme.colors.hairlineStrong
          : appTheme.colors.hairline,
      shadowColor: "#000000",
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: interpolate(emphasis.value, [0, 1], [0.08, 0.14]),
      shadowRadius: 20,
    };
  }, []);

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
    <Animated.View
      className="overflow-hidden rounded-[24px] border px-4 py-2"
      style={shellStyle}
    >
      <View className="gap-1">
        {topAccessory ? <View className="pb-0.5">{topAccessory}</View> : null}
        <ComposerInput
          className="px-0 py-0 text-[16px] leading-[21px] text-white/94"
          containerClassName={cn("min-w-0 border-0 bg-transparent px-1 py-0.5")}
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
        <View className="flex-row items-center justify-between px-1 pb-0">
          <View className="flex-row items-center gap-2">
            <View
              className="h-7 flex-row items-center justify-center rounded-full border px-3"
              style={{
                backgroundColor: appTheme.colors.panelMuted,
                borderColor: appTheme.colors.hairline,
              }}
            >
              <Ionicons
                color={appTheme.colors.inkSoft}
                name="flash-outline"
                size={12}
              />
              <View className="w-1.5" />
              <Animated.Text
                className="text-[12px] font-medium"
                style={{ color: appTheme.colors.inkSoft }}
              >
                Auto
              </Animated.Text>
            </View>
          </View>
          <View className="flex-row items-center gap-1.5">
            {voiceEnabled ? (
              <View
                className="h-9 w-9 items-center justify-center overflow-hidden rounded-full border"
                style={{
                  backgroundColor: appTheme.colors.panelMuted,
                  borderColor: appTheme.colors.hairline,
                }}
              >
                <VoiceMicButton
                  className="mb-0 h-9 w-9 rounded-full bg-transparent"
                  disabled={sending}
                  iconColorActive={appTheme.colors.ink}
                  iconColorIdle={appTheme.colors.inkMuted}
                  iconSize={16}
                  onFinalTranscript={mergeVoice}
                  voiceEnabled={voiceEnabled}
                />
              </View>
            ) : null}
            <Animated.View style={sendButtonStyle}>
              <View
                className="h-9 w-9 overflow-hidden rounded-full border"
                style={{
                  backgroundColor: showActive
                    ? appTheme.colors.ink
                    : appTheme.colors.panelMuted,
                  borderColor: showActive
                    ? appTheme.colors.ink
                    : appTheme.colors.hairline,
                }}
              >
                <Pressable
                  accessibilityLabel={effectiveSendAccessibilityLabel}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !canSend || sending }}
                  className={cn(
                    "h-9 w-9 items-center border-0 justify-center bg-transparent",
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
                      <ActivityIndicator
                        color={
                          showActive
                            ? appTheme.colors.background
                            : appTheme.colors.ink
                        }
                        size="small"
                      />
                    ) : (
                      <Ionicons
                        color={
                          showActive
                            ? appTheme.colors.background
                            : appTheme.colors.inkMuted
                        }
                        name="arrow-up"
                        size={18}
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
