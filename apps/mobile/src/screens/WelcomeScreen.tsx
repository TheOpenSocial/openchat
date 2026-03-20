import { useEffect, useRef } from "react";
import { Animated, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { PrimaryButton } from "../components/PrimaryButton";
import { appTheme } from "../theme";

interface WelcomeScreenProps {
  onContinue: () => void;
}

export function WelcomeScreen({ onContinue }: WelcomeScreenProps) {
  const pulse = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.45,
          duration: 900,
          useNativeDriver: true,
        }),
      ]),
    );
    pulseAnimation.start();
    return () => pulseAnimation.stop();
  }, [pulse]);

  return (
    <SafeAreaView
      className="flex-1 bg-canvas px-6 py-6"
      testID="design-welcome-screen"
    >
      <View className="mb-10 flex-row items-center justify-between">
        <View className="rounded-full border border-hairline bg-surfaceMuted/80 px-3 py-1">
          <Text className="text-[11px] font-semibold uppercase tracking-widest text-muted">
            Design preview
          </Text>
        </View>
        <Animated.View
          className="h-2.5 w-2.5 rounded-full bg-accent"
          style={{ opacity: pulse }}
        />
      </View>

      <View className="flex-1 justify-center">
        <Text
          className="mb-3 text-[34px] font-semibold leading-tight tracking-tight text-ink"
          style={{ fontFamily: appTheme.fonts.heading }}
        >
          OpenSocial
        </Text>
        <Text className="mb-8 max-w-[340px] text-[16px] leading-7 text-muted">
          Explore the full mobile shell—home, discover, inbox, chats, and
          profile—with realistic mock data. No API or account required.
        </Text>
        <PrimaryButton
          label="Explore the app"
          onPress={onContinue}
          testID="design-welcome-continue"
        />
        <Text className="mt-4 text-center text-[12px] text-muted/90">
          Preview mode · data stays on this device only
        </Text>
      </View>
    </SafeAreaView>
  );
}
