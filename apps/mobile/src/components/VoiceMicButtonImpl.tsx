import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useCallback, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";

import { cn } from "../lib/cn";
import { appTheme } from "../theme";

export interface VoiceMicButtonImplProps {
  disabled?: boolean;
  label?: string;
  onFinalTranscript: (text: string) => void;
  onListeningChange?: (listening: boolean) => void;
  size?: "icon" | "pill";
  voiceEnabled?: boolean;
}

export function VoiceMicButtonImpl({
  disabled = false,
  label,
  onFinalTranscript,
  onListeningChange,
  size = "icon",
  voiceEnabled = true,
}: VoiceMicButtonImplProps) {
  const [listening, setListening] = useState(false);

  useSpeechRecognitionEvent("result", (event) => {
    const line = event.results[0]?.transcript?.trim();
    if (!line) {
      return;
    }
    if (event.isFinal) {
      onFinalTranscript(line);
      setListening(false);
      onListeningChange?.(false);
      try {
        ExpoSpeechRecognitionModule.stop();
      } catch {
        /* ignore */
      }
    }
  });

  useSpeechRecognitionEvent("error", () => {
    setListening(false);
    onListeningChange?.(false);
  });

  useSpeechRecognitionEvent("end", () => {
    setListening(false);
    onListeningChange?.(false);
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
      setListening(false);
      onListeningChange?.(false);
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

      setListening(true);
      onListeningChange?.(true);
      ExpoSpeechRecognitionModule.start({
        addsPunctuation: true,
        continuous: false,
        interimResults: true,
        lang: "en-US",
      });
    } catch {
      setListening(false);
      onListeningChange?.(false);
      Alert.alert(
        "Voice input unavailable",
        "Speech recognition requires a dev build with the native module enabled.",
        [{ text: "OK" }],
      );
    }
  }, [disabled, listening, onListeningChange, voiceEnabled]);

  if (!voiceEnabled) {
    return null;
  }

  return (
    <Pressable
      accessibilityLabel={listening ? "Stop dictation" : "Voice input"}
      accessibilityRole="button"
      accessibilityState={{ selected: listening }}
      className={cn(
        size === "pill"
          ? "h-14 min-h-[56px] flex-row items-center justify-center gap-3 rounded-full px-5 active:opacity-85"
          : "mb-1 h-9 w-9 items-center justify-center rounded-full active:opacity-85",
        listening
          ? size === "pill"
            ? "bg-white"
            : "bg-accentMuted"
          : size === "pill"
            ? "bg-white"
            : "bg-transparent",
      )}
      disabled={disabled}
      hitSlop={8}
      onPress={() => void toggle()}
      testID="composer-voice-button"
    >
      {size === "pill" ? (
        <View className="flex-row items-center gap-3">
          <View
            className={cn(
              "h-8 w-8 items-center justify-center rounded-full",
              listening ? "bg-black/8" : "bg-black/6",
            )}
          >
            <Ionicons
              color={appTheme.colors.background}
              name={listening ? "mic" : "mic-outline"}
              size={18}
            />
          </View>
          <Text className="text-[15px] font-semibold text-black">
            {label ?? (listening ? "Listening…" : "Speak to start")}
          </Text>
        </View>
      ) : (
        <Ionicons
          color={listening ? appTheme.colors.accent : appTheme.colors.muted}
          name={listening ? "mic" : "mic-outline"}
          size={22}
        />
      )}
    </Pressable>
  );
}
