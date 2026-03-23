import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useCallback, useEffect, useRef, useState } from "react";
import { Animated } from "react-native";
import { Alert, Pressable, View } from "react-native";

import { cn } from "../lib/cn";
import { appTheme } from "../theme";
import type { VoiceMicButtonProps } from "./VoiceMicButton.types";
import { VoiceWaveform } from "./VoiceWaveform";

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
  liveLevel = -2,
  onFinalTranscript,
  onListeningChange,
  onVolumeChange,
  showLiveIndicator = false,
  voiceEnabled = true,
}: VoiceMicButtonProps) {
  const [listening, setListening] = useState(false);
  const indicatorOpacity = useRef(new Animated.Value(0)).current;
  const labelOpacity = useRef(new Animated.Value(1)).current;

  const updateListening = useCallback(
    (next: boolean) => {
      setListening(next);
      onListeningChange?.(next);
    },
    [onListeningChange],
  );

  useEffect(() => {
    Animated.timing(indicatorOpacity, {
      toValue: listening && showLiveIndicator ? 1 : 0,
      duration: listening ? 140 : 180,
      useNativeDriver: true,
    }).start();
  }, [indicatorOpacity, listening, showLiveIndicator]);

  useEffect(() => {
    Animated.timing(labelOpacity, {
      toValue: listening ? 0.9 : 1,
      duration: listening ? 140 : 180,
      useNativeDriver: true,
    }).start();
  }, [labelOpacity, listening]);

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
    onVolumeChange?.(-2);
    updateListening(false);
  });

  useSpeechRecognitionEvent("end", () => {
    onVolumeChange?.(-2);
    updateListening(false);
  });

  useSpeechRecognitionEvent("volumechange", (event) => {
    onVolumeChange?.(event.value);
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
      onVolumeChange?.(-2);
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
        volumeChangeEventOptions: {
          enabled: true,
          intervalMillis: 90,
        },
      });
    } catch {
      onVolumeChange?.(-2);
      updateListening(false);
      Alert.alert(
        "Voice input unavailable",
        "Speech recognition requires a dev build with the native module enabled.",
        [{ text: "OK" }],
      );
    }
  }, [disabled, listening, onVolumeChange, updateListening, voiceEnabled]);

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
          ? "mb-0 h-14 flex-row items-center justify-center rounded-full px-5"
          : "mb-1 h-9 w-9 items-center justify-center rounded-full",
        listening ? "bg-accentMuted" : "bg-transparent",
        className,
      )}
      disabled={disabled}
      hitSlop={8}
      onPress={() => void toggle()}
      style={({ pressed }) => ({
        transform: [
          {
            scale: pressed && !disabled ? (listening ? 0.985 : 0.975) : 1,
          },
        ],
      })}
      testID="composer-voice-button"
    >
      {label ? (
        <View className="flex-1 flex-row items-center justify-between">
          <View className="w-8 items-start">
            <Ionicons
              color={listening ? iconColorActive : iconColorIdle}
              name={listening ? "mic" : "mic-outline"}
              size={iconSize}
            />
          </View>
          <View className="flex-1 items-center px-2">
            <Animated.Text
              className="text-[15px] font-medium"
              numberOfLines={1}
              style={{
                color: listening ? iconColorActive : iconColorIdle,
                opacity: labelOpacity,
              }}
            >
              {listening ? (activeLabel ?? label) : label}
            </Animated.Text>
          </View>
          {showLiveIndicator ? (
            <Animated.View
              className="items-end"
              style={{
                opacity: indicatorOpacity,
                width: 40,
              }}
            >
              <VoiceWaveform
                bars={11}
                level={liveLevel}
                listening={listening}
              />
            </Animated.View>
          ) : null}
        </View>
      ) : (
        <Ionicons
          color={listening ? iconColorActive : iconColorIdle}
          name={listening ? "mic" : "mic-outline"}
          size={iconSize}
        />
      )}
    </Pressable>
  );
}
