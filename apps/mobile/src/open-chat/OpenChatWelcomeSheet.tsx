import { BlurView } from "expo-blur";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useRef } from "react";
import {
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { AppLocale } from "../i18n/strings";
import { t } from "../i18n/strings";
import { hapticImpact, hapticSelection } from "../lib/haptics";
import { appTheme } from "../theme";

const WELCOME_EXAMPLES = {
  en: [
    "Find people to play tonight",
    "Meet someone into design and coffee",
    "Start a small group for this weekend",
  ],
  es: [
    "Encontrar gente para jugar esta noche",
    "Conocer a alguien que ame el diseno y el cafe",
    "Armar un grupo chico para este fin de semana",
  ],
} as const;

type OpenChatWelcomeSheetProps = {
  locale: AppLocale;
  onClose: () => void;
  onPickExample: (text: string) => void;
  visible: boolean;
};

export function OpenChatWelcomeSheet({
  locale,
  onClose,
  onPickExample,
  visible,
}: OpenChatWelcomeSheetProps) {
  const insets = useSafeAreaInsets();
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const sheetOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(new Animated.Value(28)).current;
  const topMargin = Math.max(insets.top + 24, 76);

  useEffect(() => {
    if (!visible) {
      backdropOpacity.setValue(0);
      sheetOpacity.setValue(0);
      sheetTranslateY.setValue(28);
      return;
    }

    Animated.parallel([
      Animated.timing(backdropOpacity, {
        duration: 220,
        toValue: 1,
        useNativeDriver: true,
      }),
      Animated.timing(sheetOpacity, {
        duration: 240,
        toValue: 1,
        useNativeDriver: true,
      }),
      Animated.timing(sheetTranslateY, {
        duration: 280,
        toValue: 0,
        useNativeDriver: true,
      }),
    ]).start();
  }, [backdropOpacity, sheetOpacity, sheetTranslateY, visible]);

  const examples = WELCOME_EXAMPLES[locale] ?? WELCOME_EXAMPLES.en;

  return (
    <Modal
      animationType="none"
      onRequestClose={onClose}
      presentationStyle="overFullScreen"
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <View className="flex-1 justify-end">
        <Animated.View
          className="absolute inset-0"
          style={{ opacity: backdropOpacity }}
        >
          <Pressable className="flex-1 bg-black/70" onPress={onClose}>
            <BlurView
              intensity={24}
              style={StyleSheet.absoluteFillObject}
              tint="dark"
            />
          </Pressable>
        </Animated.View>

        <Animated.View
          className="overflow-hidden rounded-t-[34px] border border-white/10 bg-[#0b0d10]"
          style={{
            marginTop: topMargin,
            opacity: sheetOpacity,
            paddingBottom: Math.max(insets.bottom, 18),
            transform: [{ translateY: sheetTranslateY }],
          }}
        >
          <BlurView
            intensity={36}
            style={StyleSheet.absoluteFillObject}
            tint="dark"
          />
          <View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFillObject,
              { backgroundColor: "rgba(255,255,255,0.025)" },
            ]}
          />

          <View className="items-center pt-3">
            <View className="h-1.5 w-11 rounded-full bg-white/18" />
          </View>

          <ScrollView
            bounces={false}
            contentContainerStyle={{
              paddingHorizontal: 22,
              paddingTop: 18,
              paddingBottom: 6,
            }}
            showsVerticalScrollIndicator={false}
          >
            <View className="flex-row items-start justify-between gap-4">
              <View className="min-w-0 flex-1">
                <Text className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/34">
                  OpenSocial
                </Text>
                <Text className="mt-4 max-w-[300px] text-[33px] font-semibold tracking-[-0.045em] text-white">
                  {t("homeWelcomeTitle", locale)}
                </Text>
                <Text className="mt-3 max-w-[318px] text-[15px] leading-[23px] text-white/46">
                  {t("homeWelcomeSubtitle", locale)}
                </Text>
              </View>
              <Pressable
                accessibilityLabel={t("homeWelcomeSkip", locale)}
                accessibilityRole="button"
                className="h-10 w-10 items-center justify-center rounded-full bg-white/[0.05]"
                hitSlop={8}
                onPress={() => {
                  hapticSelection();
                  onClose();
                }}
                testID="home-welcome-close"
                style={({ pressed }) => ({
                  opacity: pressed ? appTheme.motion.pressOpacity : 1,
                })}
              >
                <Ionicons
                  color="rgba(255,255,255,0.78)"
                  name="close"
                  size={18}
                />
              </Pressable>
            </View>

            <View className="mt-8 gap-0">
              <WelcomeFact
                body={t("homeWelcomeHowItWorksBody", locale)}
                title={t("homeWelcomeHowItWorksTitle", locale)}
              />
              <WelcomeFact
                body={t("homeWelcomeExamplesBody", locale)}
                title={t("homeWelcomeExamplesTitle", locale)}
              />
              <WelcomeFact
                body={t("homeWelcomeChatsBody", locale)}
                title={t("homeWelcomeChatsTitle", locale)}
              />
            </View>

            <View className="mt-8">
              <Text className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/34">
                {t("homeWelcomeTryTitle", locale)}
              </Text>
              <View className="gap-2.5">
                {examples.map((example) => (
                  <Pressable
                    accessibilityHint={t("homeWelcomeTryHint", locale)}
                    accessibilityLabel={example}
                    accessibilityRole="button"
                    className="rounded-[20px] border border-white/[0.08] bg-white/[0.03] px-4 py-4"
                    key={example}
                    onPress={() => {
                      hapticImpact();
                      onPickExample(example);
                    }}
                    style={({ pressed }) => ({
                      opacity: pressed ? 0.84 : 1,
                    })}
                  >
                    <Text className="text-[16px] font-medium leading-[22px] text-white/92">
                      {example}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View className="mt-9 flex-row items-center gap-3 pb-2">
              <Pressable
                accessibilityRole="button"
                className="min-h-[52px] flex-1 items-center justify-center rounded-full bg-white px-5"
                onPress={() => {
                  hapticImpact();
                  onClose();
                }}
                testID="home-welcome-primary"
                style={({ pressed }) => ({
                  opacity: pressed ? appTheme.motion.pressOpacity : 1,
                })}
              >
                <Text className="text-[15px] font-semibold text-[#0a0d12]">
                  {t("homeWelcomePrimaryCta", locale)}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                className="min-h-[52px] items-center justify-center rounded-full border border-white/10 bg-white/[0.03] px-5"
                onPress={() => {
                  hapticSelection();
                  onClose();
                }}
                testID="home-welcome-skip"
                style={({ pressed }) => ({
                  opacity: pressed ? appTheme.motion.pressOpacity : 1,
                })}
              >
                <Text className="text-[15px] font-medium text-white/78">
                  {t("homeWelcomeSkip", locale)}
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

type WelcomeFactProps = {
  body: string;
  title: string;
};

function WelcomeFact({ body, title }: WelcomeFactProps) {
  return (
    <View className="border-b border-white/[0.07] py-4 last:border-b-0">
      <Text className="text-[15px] font-semibold text-white/94">{title}</Text>
      <Text className="mt-1.5 max-w-[320px] text-[14px] leading-[21px] text-white/48">
        {body}
      </Text>
    </View>
  );
}
