import Ionicons from "@expo/vector-icons/Ionicons";
import { ActivityIndicator, Platform, Pressable, View } from "react-native";

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
  const showActive = canSend && !sending;
  const effectiveMultiline = e2eSubmitOnReturn ? false : true;
  const effectivePlaceholder =
    placeholder ?? t("openChatComposerPlaceholder", locale);
  const effectiveSendAccessibilityLabel =
    sendAccessibilityLabel ?? t("openChatSendMessage", locale);

  const mergeVoice = (line: string) => {
    onVoiceTranscript?.(line);
    const next = value.trim().length > 0 ? `${value.trim()} ${line}` : line;
    onChangeText(next);
  };

  return (
    <View className="flex-row items-end gap-2">
      <ComposerInput
        blurOnSubmit={e2eSubmitOnReturn}
        className="py-2.5 text-[16px] leading-[24px] text-white/95"
        containerClassName={cn(
          "min-h-[48px] min-w-0 flex-1 rounded-[22px] border border-white/12 bg-white/[0.06] px-4",
        )}
        editable={!sending}
        maxLength={maxLength}
        multiline={effectiveMultiline}
        onChangeText={onChangeText}
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
        placeholderTextColor="rgba(255,255,255,0.32)"
        returnKeyType={e2eSubmitOnReturn ? "send" : "default"}
        testID={inputTestID}
        value={value}
      />
      {voiceEnabled ? (
        <VoiceMicButton
          disabled={sending}
          onFinalTranscript={mergeVoice}
          voiceEnabled={voiceEnabled}
        />
      ) : null}
      <Pressable
        accessibilityLabel={effectiveSendAccessibilityLabel}
        accessibilityRole="button"
        accessibilityState={{ disabled: !canSend || sending }}
        android_ripple={
          Platform.OS === "android" && showActive
            ? { color: "rgba(255,255,255,0.2)", borderless: true }
            : undefined
        }
        className={cn(
          "mb-0.5 h-11 w-11 items-center justify-center rounded-full",
          showActive ? "bg-white/90" : "bg-white/12",
        )}
        disabled={!canSend || sending}
        hitSlop={8}
        onPress={() => void onSend()}
        style={({ pressed }) => ({
          opacity: pressed && !sending ? appTheme.motion.pressOpacity : 1,
        })}
      >
        <View collapsable={false} pointerEvents="none" testID={sendTestID}>
          {sending ? (
            <ActivityIndicator color="#111" size="small" />
          ) : (
            <Ionicons
              color={showActive ? "#111111" : "rgba(255,255,255,0.35)"}
              name="arrow-up"
              size={22}
            />
          )}
        </View>
      </Pressable>
    </View>
  );
}
