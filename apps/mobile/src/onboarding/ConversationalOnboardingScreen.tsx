import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Keyboard,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import { PrimaryButton } from "../components/PrimaryButton";
import { VoiceMicButton } from "../components/VoiceMicButton";
import { type AppLocale, t } from "../i18n/strings";
import { appTheme } from "../theme";
import {
  type InferredProfile,
  type OnboardingMessage,
} from "./conversational-onboarding";

interface ConversationalOnboardingScreenProps {
  locale: AppLocale;
  messages: OnboardingMessage[];
  draftValue: string;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onVoiceTranscript: (text: string) => void;
  onHowItWorks: () => void;
  onUseThis: () => void;
  onOpenGuided: () => void;
  inferred: InferredProfile;
  ready: boolean;
  loading?: boolean;
}

function SummaryPill({ label }: { label: string }) {
  return (
    <View className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5">
      <Text className="text-[12px] font-medium text-white/60">{label}</Text>
    </View>
  );
}

function ThreadMessage({ message }: { message: OnboardingMessage }) {
  const isAgent = message.role === "agent";
  return (
    <View className={isAgent ? "self-stretch" : "self-end"}>
      {isAgent ? (
        <View className="max-w-[92%] self-start px-1 py-1">
          <Text className="text-[15px] leading-[24px] text-white/82">
            {message.content}
          </Text>
        </View>
      ) : (
        <View className="max-w-[88%] self-end rounded-[26px] rounded-br-[12px] border border-white/12 bg-white/[0.08] px-4 py-3.5">
          <Text className="text-[15px] leading-[23px] text-white">
            {message.content}
          </Text>
        </View>
      )}
    </View>
  );
}

export function ConversationalOnboardingScreen({
  draftValue,
  inferred,
  loading = false,
  locale,
  messages,
  onDraftChange,
  onHowItWorks,
  onOpenGuided,
  onSend,
  onUseThis,
  onVoiceTranscript,
  ready,
}: ConversationalOnboardingScreenProps) {
  const heroOpacity = useRef(new Animated.Value(1)).current;
  const [composerFocused, setComposerFocused] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const scrollRef = useRef<ScrollView | null>(null);

  useEffect(() => {
    Animated.timing(heroOpacity, {
      toValue: messages.length > 1 ? 0.28 : 1,
      duration: 280,
      useNativeDriver: true,
    }).start();
  }, [heroOpacity, messages.length]);

  useEffect(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
  }, [messages.length]);

  const summaryLabels = useMemo(() => {
    const labels = [
      ...inferred.goals,
      ...inferred.interests.slice(0, 3),
      inferred.location,
      inferred.format === "small_groups"
        ? "Small groups"
        : inferred.format === "one_to_one"
          ? "1:1"
          : inferred.format === "both"
            ? "1:1 + groups"
            : undefined,
      inferred.mode === "in_person"
        ? "In person"
        : inferred.mode === "online"
          ? "Online"
          : inferred.mode === "both"
            ? "Online + in person"
            : undefined,
      inferred.availability,
      inferred.style,
    ].filter(Boolean) as string[];
    return labels.slice(0, 8);
  }, [inferred]);

  const canSend = draftValue.trim().length > 0 && !loading;

  return (
    <View className="flex-1">
      <Animated.View
        className="px-5 pb-4 pt-6"
        style={{ opacity: heroOpacity }}
      >
        <Text className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/28">
          {t("commonStepOf", locale, { current: 1, total: 5 })}
        </Text>
        <Text className="mt-3 text-[34px] font-semibold leading-[38px] tracking-tight text-white">
          {t("onboardingStepOneTitle", locale)}
        </Text>
        <Text className="mt-3 max-w-[330px] text-[16px] leading-[24px] text-white/52">
          {t("onboardingIntakeLabel", locale)}
        </Text>
      </Animated.View>

      <View className="px-5 pb-2">
        <Pressable
          className="self-start rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-2"
          hitSlop={8}
          onPress={() => setSummaryOpen((open) => !open)}
        >
          <Text className="text-[13px] text-white/42">
            {t("onboardingIntakeSummary", locale)}
          </Text>
        </Pressable>
        {summaryOpen ? (
          <View className="mt-3 rounded-[24px] border border-white/[0.08] bg-white/[0.035] px-4 py-4">
            {summaryLabels.length > 0 ? (
              <View className="flex-row flex-wrap gap-2">
                {summaryLabels.map((label) => (
                  <SummaryPill key={label} label={label} />
                ))}
              </View>
            ) : (
              <Text className="text-[14px] leading-[22px] text-white/42">
                {t("onboardingIntakeSummaryEmpty", locale)}
              </Text>
            )}
          </View>
        ) : null}
      </View>

      <Pressable className="flex-1" onPress={() => Keyboard.dismiss()}>
        <ScrollView
          ref={scrollRef}
          className="flex-1"
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingBottom: 24,
            gap: 18,
          }}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          onScrollBeginDrag={() => Keyboard.dismiss()}
          showsVerticalScrollIndicator={false}
        >
          {messages.map((message) => (
            <ThreadMessage key={message.id} message={message} />
          ))}
        </ScrollView>
      </Pressable>

      <View className="border-t border-white/[0.06] px-5 pb-4 pt-3">
        <View
          className={
            composerFocused
              ? "rounded-[28px] border border-white/18 bg-white/[0.08] px-4 py-4"
              : "rounded-[28px] border border-white/10 bg-white/[0.05] px-4 py-4"
          }
        >
          <View className="mb-3 flex-row items-center justify-between">
            <Text className="text-[12px] leading-[18px] text-white/30">
              {t("onboardingIntakeVoiceHint", locale)}
            </Text>
            {composerFocused ? (
              <Pressable
                accessibilityRole="button"
                className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5"
                hitSlop={8}
                onPress={() => Keyboard.dismiss()}
              >
                <Text className="text-[12px] font-medium text-white/52">
                  {t("onboardingIntakeDone", locale)}
                </Text>
              </Pressable>
            ) : null}
          </View>

          <View className="rounded-[22px] border border-white/[0.06] bg-[#060606] px-4 py-3">
            <TextInput
              className="min-h-[110px] text-[16px] leading-[24px] text-white"
              multiline
              onBlur={() => setComposerFocused(false)}
              onChangeText={onDraftChange}
              onFocus={() => setComposerFocused(true)}
              placeholder={t("onboardingIntakePlaceholder", locale)}
              placeholderTextColor="rgba(255,255,255,0.32)"
              returnKeyType="default"
              scrollEnabled
              selectionColor="rgba(255,255,255,0.75)"
              testID="onboarding-intake-input"
              textAlignVertical="top"
              value={draftValue}
            />
          </View>

          <View className="mt-3 flex-row items-center justify-between gap-3">
            <VoiceMicButton onFinalTranscript={onVoiceTranscript} />
            <Pressable
              accessibilityLabel={t("onboardingIntakeSend", locale)}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSend }}
              className={
                canSend
                  ? "h-12 w-12 items-center justify-center rounded-full bg-white"
                  : "h-12 w-12 items-center justify-center rounded-full bg-white/12"
              }
              disabled={!canSend}
              onPress={onSend}
              style={({ pressed }) => ({
                opacity: pressed ? appTheme.motion.pressOpacity : 1,
              })}
              testID="onboarding-chat-send"
            >
              <Ionicons
                color={canSend ? "#0d0d0d" : "rgba(255,255,255,0.3)"}
                name="arrow-up"
                size={22}
              />
            </Pressable>
          </View>
        </View>

        <View className="mt-3 gap-3">
          {ready ? (
            <View className="rounded-[24px] border border-white/[0.08] bg-white/[0.04] px-4 py-4">
              <Text className="text-[14px] leading-[22px] text-white/52">
                {t("onboardingIntakeReadyHint", locale)}
              </Text>
              <View className="mt-3">
                <PrimaryButton
                  label={t("onboardingIntakeReady", locale)}
                  loading={loading}
                  onPress={onUseThis}
                  testID="onboarding-conversation-use-this"
                />
              </View>
            </View>
          ) : null}
          <Pressable
            accessibilityRole="button"
            className="items-center py-2"
            disabled={loading}
            onPress={onOpenGuided}
          >
            <Text className="text-[14px] text-white/40">
              {t("onboardingIntakeGuided", locale)}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            className="items-center py-1"
            hitSlop={10}
            onPress={onHowItWorks}
          >
            <Text className="text-[13px] text-white/32">
              {t("onboardingHowItWorksCta", locale)}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
