import Ionicons from "@expo/vector-icons/Ionicons";
import { ActivityIndicator, Platform, Pressable, View } from "react-native";

import { appTheme } from "../theme";
import { cn } from "../lib/cn";
import { ComposerInput } from "./ComposerInput";
import { VoiceMicButton } from "./VoiceMicButton";

interface MessageComposerProps {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void | Promise<void>;
  canSend: boolean;
  sending?: boolean;
  placeholder?: string;
  maxLength?: number;
  multiline?: boolean;
  inputTestID?: string;
  sendTestID?: string;
  inputClassName?: string;
  /** Show dictation control (native speech module when available). */
  voiceEnabled?: boolean;
  /** Distinct label so E2E can target the composer send vs keyboard actions. */
  sendAccessibilityLabel?: string;
  /**
   * Single-line + return-to-send helps Maestro / XCUITest keep native text and React state in sync
   * on iOS (multiline fields often skip `onChangeText` for automated typing).
   */
  e2eSubmitOnReturn?: boolean;
  /** Raw STT line for API metadata (e.g. agent `voiceTranscript`); composer text may merge the same line. */
  onVoiceTranscript?: (line: string) => void;
}

export function MessageComposer({
  canSend,
  e2eSubmitOnReturn = false,
  inputClassName,
  inputTestID,
  maxLength,
  multiline = true,
  onChangeText,
  onSend,
  onVoiceTranscript,
  placeholder,
  sendTestID,
  sending = false,
  sendAccessibilityLabel = "Send",
  value,
  voiceEnabled = true,
}: MessageComposerProps) {
  const showActive = canSend && !sending;
  const effectiveMultiline = e2eSubmitOnReturn ? false : multiline;

  const mergeVoice = (line: string) => {
    onVoiceTranscript?.(line);
    const next = value.trim().length > 0 ? `${value.trim()} ${line}` : line;
    onChangeText(next);
  };

  return (
    <View className="flex-row items-end gap-1">
      <ComposerInput
        blurOnSubmit={e2eSubmitOnReturn}
        className={cn("py-1", inputClassName)}
        containerClassName="min-h-[44px] min-w-0 flex-1"
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
        placeholder={placeholder}
        returnKeyType={e2eSubmitOnReturn ? "send" : undefined}
        testID={inputTestID}
        value={value}
      />
      <VoiceMicButton
        disabled={sending}
        onFinalTranscript={mergeVoice}
        voiceEnabled={voiceEnabled}
      />
      <Pressable
        accessibilityLabel={sendAccessibilityLabel}
        accessibilityRole="button"
        accessibilityState={{ disabled: !canSend || sending }}
        android_ripple={
          Platform.OS === "android" && showActive && !sending
            ? { color: "rgba(255,255,255,0.25)", borderless: true }
            : undefined
        }
        className={cn(
          "mb-1 h-10 w-10 items-center justify-center rounded-full",
          showActive ? "bg-accent shadow-sm shadow-black/35" : "bg-hairline",
        )}
        disabled={!canSend || sending}
        hitSlop={8}
        onPress={() => {
          void onSend();
        }}
        style={({ pressed }) => ({
          opacity: pressed && !sending ? appTheme.motion.pressOpacity : 1,
        })}
      >
        <View collapsable={false} pointerEvents="none" testID={sendTestID}>
          {sending ? (
            <ActivityIndicator color="#ffffff" size="small" />
          ) : (
            <Ionicons
              color={showActive ? "#ffffff" : appTheme.colors.muted}
              name="arrow-up"
              size={23}
            />
          )}
        </View>
      </Pressable>
    </View>
  );
}
