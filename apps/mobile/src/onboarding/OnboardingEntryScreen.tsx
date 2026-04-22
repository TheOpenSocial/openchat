import { Image, Pressable, Text, View } from "react-native";
import { useEffect, useRef } from "react";
import { Animated, Easing } from "react-native";

import logoAsset from "../../assets/brand/logo.png";
import { PrimaryButton } from "../components/PrimaryButton";
import { VoiceMicButton } from "../components/VoiceMicButton";
import { type AppLocale, t } from "../i18n/strings";
import { speechRecognitionAvailable } from "../lib/speech-recognition-available";
import { appTheme } from "../theme";

interface OnboardingEntryScreenProps {
  locale: AppLocale;
  listening: boolean;
  onHowItWorks: () => void;
  onManual: () => void;
  onVoiceTranscript: (text: string) => void;
  onListeningChange: (listening: boolean) => void;
}

export function OnboardingEntryScreen({
  listening,
  locale,
  onHowItWorks,
  onListeningChange,
  onManual,
  onVoiceTranscript,
}: OnboardingEntryScreenProps) {
  const ripple = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!listening) {
      ripple.stopAnimation();
      ripple.setValue(0);
      return;
    }

    const loop = Animated.loop(
      Animated.timing(ripple, {
        toValue: 1,
        duration: 1800,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => {
      loop.stop();
      ripple.stopAnimation();
      ripple.setValue(0);
    };
  }, [listening, ripple]);

  const voiceAvailable = speechRecognitionAvailable();

  return (
    <View className="flex-1 items-center justify-center px-7">
      <Text className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/28">
        {t("onboardingEntryKicker", locale)}
      </Text>

      <View className="mt-8 h-[196px] w-[196px] items-center justify-center">
        <Animated.View
          className="absolute h-[196px] w-[196px] rounded-full border border-white/8"
          style={{
            opacity: ripple.interpolate({
              inputRange: [0, 1],
              outputRange: [0.2, 0],
            }),
            transform: [
              {
                scale: ripple.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.82, 1.24],
                }),
              },
            ],
          }}
        />
        <Animated.View
          className="absolute h-[156px] w-[156px] rounded-full border border-white/[0.05]"
          style={{
            opacity: ripple.interpolate({
              inputRange: [0, 1],
              outputRange: [0.14, 0],
            }),
            transform: [
              {
                scale: ripple.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.92, 1.14],
                }),
              },
            ],
          }}
        />
        <View className="h-[112px] w-[112px] items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.025]">
          <Image
            resizeMode="contain"
            source={logoAsset}
            style={{ height: 54, opacity: 0.96, width: 54 }}
          />
        </View>
      </View>

      <Text className="mt-8 text-center text-[34px] font-semibold leading-[38px] tracking-tight text-white">
        {t("onboardingEntryTitle", locale)}
      </Text>
      <Text className="mt-4 max-w-[320px] text-center text-[16px] leading-[24px] text-white/52">
        {t("onboardingEntrySubtitle", locale)}
      </Text>

      <View className="mt-8 items-center">
        <VoiceMicButton
          accessibilityLabelActive={t("onboardingEntryListening", locale)}
          accessibilityLabelIdle={t("onboardingEntryTitle", locale)}
          className="mb-0 h-[76px] w-[76px] rounded-full border border-white/10 bg-white/[0.04]"
          iconSize={32}
          onFinalTranscript={onVoiceTranscript}
          onListeningChange={onListeningChange}
        />
        <Text className="mt-4 text-[13px] font-medium text-white/42">
          {listening
            ? t("onboardingEntryListening", locale)
            : t("onboardingIntakeVoiceHint", locale)}
        </Text>
        {!voiceAvailable ? (
          <Text className="mt-2 max-w-[280px] text-center text-[12px] leading-[18px] text-white/28">
            {t("onboardingEntryVoiceUnavailable", locale)}
          </Text>
        ) : null}
      </View>

      <View className="mt-8 w-full max-w-[320px]">
        <PrimaryButton
          label={t("onboardingEntryManual", locale)}
          onPress={onManual}
          variant="ghost"
          testID="onboarding-entry-manual"
        />
      </View>

      <Pressable
        accessibilityRole="button"
        className="mt-4 py-2"
        hitSlop={10}
        onPress={onHowItWorks}
        style={({ pressed }) => ({
          opacity: pressed ? appTheme.motion.pressOpacity : 1,
        })}
      >
        <Text className="text-[12px] text-white/22">
          {t("onboardingHowItWorksCta", locale)}
        </Text>
      </Pressable>
    </View>
  );
}
