import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useCallback, useState } from "react";
import { Alert, Pressable } from "react-native";

import { cn } from "../lib/cn";
import { appTheme } from "../theme";

export interface VoiceMicButtonImplProps {
  disabled?: boolean;
  onFinalTranscript: (text: string) => void;
  voiceEnabled?: boolean;
}

export function VoiceMicButtonImpl({
  disabled = false,
  onFinalTranscript,
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
      try {
        ExpoSpeechRecognitionModule.stop();
      } catch {
        /* ignore */
      }
    }
  });

  useSpeechRecognitionEvent("error", () => {
    setListening(false);
  });

  useSpeechRecognitionEvent("end", () => {
    setListening(false);
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
      ExpoSpeechRecognitionModule.start({
        addsPunctuation: true,
        continuous: false,
        interimResults: true,
        lang: "en-US",
      });
    } catch {
      setListening(false);
      Alert.alert(
        "Voice input unavailable",
        "Speech recognition requires a dev build with the native module enabled.",
        [{ text: "OK" }],
      );
    }
  }, [disabled, listening, voiceEnabled]);

  if (!voiceEnabled) {
    return null;
  }

  return (
    <Pressable
      accessibilityLabel={listening ? "Stop dictation" : "Voice input"}
      accessibilityRole="button"
      accessibilityState={{ selected: listening }}
      className={cn(
        "mb-1 h-9 w-9 items-center justify-center rounded-full active:opacity-85",
        listening ? "bg-accentMuted" : "bg-transparent",
      )}
      disabled={disabled}
      hitSlop={8}
      onPress={() => void toggle()}
      testID="composer-voice-button"
    >
      <Ionicons
        color={listening ? appTheme.colors.accent : appTheme.colors.muted}
        name={listening ? "mic" : "mic-outline"}
        size={22}
      />
    </Pressable>
  );
}
