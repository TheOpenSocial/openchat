import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useCallback, useState } from "react";
import { Alert, Pressable, Text } from "react-native";

import { cn } from "../lib/cn";
import { appTheme } from "../theme";

export interface VoiceMicButtonImplProps {
  disabled?: boolean;
  onFinalTranscript: (text: string) => void;
  onListeningChange?: (listening: boolean) => void;
  voiceEnabled?: boolean;
  className?: string;
  iconSize?: number;
  accessibilityLabelIdle?: string;
  accessibilityLabelActive?: string;
  label?: string;
  activeLabel?: string;
  iconColorIdle?: string;
  iconColorActive?: string;
}

export function VoiceMicButtonImpl({
  activeLabel,
  accessibilityLabelActive = "Stop dictation",
  accessibilityLabelIdle = "Voice input",
  className,
  disabled = false,
  iconColorActive = appTheme.colors.accent,
  iconColorIdle = appTheme.colors.muted,
  iconSize = 22,
  label,
  onFinalTranscript,
  onListeningChange,
  voiceEnabled = true,
}: VoiceMicButtonImplProps) {
  const [listening, setListening] = useState(false);

  const updateListening = useCallback(
    (next: boolean) => {
      setListening(next);
      onListeningChange?.(next);
    },
    [onListeningChange],
  );

  useSpeechRecognitionEvent("result", (event) => {
    const line = event.results[0]?.transcript?.trim();
    if (!line) {
      return;
    }
    if (event.isFinal) {
      onFinalTranscript(line);
      updateListening(false);
      try {
        ExpoSpeechRecognitionModule.stop();
      } catch {
        /* ignore */
      }
    }
  });

  useSpeechRecognitionEvent("error", () => {
    updateListening(false);
  });

  useSpeechRecognitionEvent("end", () => {
    updateListening(false);
  });

  const toggle = useCallback(async () => {
    if (disabled || !voiceEnabled) {
      return;
    }
    if (listening) {
      try {
        ExpoSpeechRecognitionModule.stop();
      } catch {
        /* ignore */
      }
      updateListening(false);
      return;
    }

    try {
      const permission =
        await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          "Voice input",
          "Microphone and speech recognition permissions are required to dictate text.",
        );
        return;
      }

      updateListening(true);
      ExpoSpeechRecognitionModule.start({
        addsPunctuation: true,
        continuous: false,
        interimResults: true,
        lang: "en-US",
      });
    } catch {
      updateListening(false);
      Alert.alert(
        "Voice input unavailable",
        "Speech recognition requires a dev build with the native module enabled.",
        [{ text: "OK" }],
      );
    }
  }, [disabled, listening, updateListening, voiceEnabled]);

  if (!voiceEnabled) {
    return null;
  }

  return (
    <Pressable
      accessibilityLabel={
        listening ? accessibilityLabelActive : accessibilityLabelIdle
      }
      accessibilityRole="button"
      accessibilityState={{ selected: listening }}
      className={cn(
        label
          ? "mb-0 flex-row items-center justify-center gap-2 rounded-full px-5 py-4 active:opacity-85"
          : "mb-1 h-9 w-9 items-center justify-center rounded-full active:opacity-85",
        listening ? "bg-accentMuted" : "bg-transparent",
        className,
      )}
      disabled={disabled}
      hitSlop={8}
      onPress={() => void toggle()}
      testID="composer-voice-button"
    >
      <Ionicons
        color={listening ? iconColorActive : iconColorIdle}
        name={listening ? "mic" : "mic-outline"}
        size={iconSize}
      />
      {label ? (
        <Text
          className="text-[15px] font-medium"
          style={{
            color: listening ? iconColorActive : iconColorIdle,
          }}
        >
          {listening ? (activeLabel ?? label) : label}
        </Text>
      ) : null}
    </Pressable>
  );
}
