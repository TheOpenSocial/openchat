import Ionicons from "@expo/vector-icons/Ionicons";
import * as ImagePicker from "expo-image-picker";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Easing,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { CalmTextField } from "../components/CalmTextField";
import { InlineNotice } from "../components/InlineNotice";
import { PrimaryButton } from "../components/PrimaryButton";
import { PremiumSpinner } from "../components/PremiumSpinner";
import { SystemBlobAnimation } from "../components/SystemBlobAnimation";
import { VoiceMicButton } from "../components/VoiceMicButton";
import { type AppLocale, t } from "../i18n/strings";
import { api } from "../lib/api";
import { hapticSelection } from "../lib/haptics";
import { speechRecognitionAvailable } from "../lib/speech-recognition-available";
import type { MobileSession } from "../types";
import { COUNTRY_OPTIONS, guessCountryFromLocale } from "./country-options";
import { inferHybridOnboarding } from "./hybrid-onboarding";
import {
  AVAILABILITY_OPTIONS,
  CONNECT_FORMAT_OPTIONS,
  defaultOnboardingState,
  mergeLoadedDraft,
  ONBOARDING_STEP_COUNT,
  ONBOARDING_TOPIC_SUGGESTIONS,
  STYLE_OPTIONS,
  type OnboardingDraftState,
} from "./onboarding-model";
import { loadOnboardingDraft, saveOnboardingDraft } from "./onboarding-storage";

export interface OnboardingFlowProps {
  session: MobileSession;
  loading: boolean;
  errorMessage: string | null;
  locale?: AppLocale;
  onSubmit: (
    state: OnboardingDraftState,
    meta: { firstIntentText: string | null },
  ) => Promise<void>;
}

const STAGE_LABELS = [
  "Getting to know you",
  "Refining",
  "Almost ready",
  "Profile",
];

function slugLabel(label: string) {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function toggleString(list: string[], value: string) {
  return list.includes(value)
    ? list.filter((x) => x !== value)
    : [...list, value];
}

function Chip({
  label,
  onPress,
  selected,
  testID,
}: {
  label: string;
  onPress: () => void;
  selected: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      className={`rounded-full border px-4 py-2.5 ${
        selected ? "border-white bg-white" : "border-white/10 bg-white/[0.04]"
      }`}
      onPress={onPress}
      testID={testID}
    >
      <Text
        className={`text-[14px] font-medium ${
          selected ? "text-[#0d0d0d]" : "text-white/65"
        }`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View className="gap-3">
      <Text className="text-[12px] font-medium uppercase tracking-[0.14em] text-white/34">
        {title}
      </Text>
      <View className="flex-row flex-wrap gap-2">{children}</View>
    </View>
  );
}

export function OnboardingFlow({
  session,
  errorMessage,
  loading,
  locale = "en",
  onSubmit,
}: OnboardingFlowProps) {
  const [draft, setDraft] = useState<OnboardingDraftState>(() =>
    defaultOnboardingState(session.displayName),
  );
  const [expressionDraft, setExpressionDraft] = useState("");
  const [processing, setProcessing] = useState(false);
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceLevel, setVoiceLevel] = useState(-2);
  const [topicQuery] = useState("");
  const [topicSuggestions, setTopicSuggestions] = useState<string[]>([]);
  const [countryFocused, setCountryFocused] = useState(false);
  const fade = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(
    new Animated.Value(1 / ONBOARDING_STEP_COUNT),
  ).current;
  const ripple = useRef(new Animated.Value(0)).current;
  const systemScale = useRef(new Animated.Value(1)).current;
  const systemOpacity = useRef(new Animated.Value(0.82)).current;
  const processingOpacity = useRef(new Animated.Value(0)).current;
  const lottieRef = useRef<{ pause?: () => void; play?: () => void } | null>(
    null,
  );
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const patch = useCallback((partial: Partial<OnboardingDraftState>) => {
    setDraft((d) => ({ ...d, ...partial }));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadOnboardingDraft(session.userId).then((loaded) => {
      if (cancelled || !loaded) return;
      const merged = mergeLoadedDraft(
        defaultOnboardingState(session.displayName),
        loaded,
      );
      setDraft(merged);
    });
    return () => {
      cancelled = true;
    };
  }, [session.displayName, session.userId]);

  useEffect(() => {
    const guessedCountry = guessCountryFromLocale();
    if (!guessedCountry) return;
    setDraft((current) =>
      current.country.trim().length > 0
        ? current
        : { ...current, country: guessedCountry },
    );
  }, []);

  useEffect(() => {
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
    }
    persistTimerRef.current = setTimeout(() => {
      void saveOnboardingDraft(session.userId, draft);
    }, 280);
    return () => {
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current);
      }
    };
  }, [draft, session.userId]);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      void api
        .getTopicSuggestions(
          session.userId,
          topicQuery,
          18,
          session.accessToken,
        )
        .then((rows) => {
          if (!cancelled) {
            setTopicSuggestions(rows.map((row) => row.label));
          }
        })
        .catch(() => {
          if (!cancelled) {
            setTopicSuggestions([]);
          }
        });
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [session.accessToken, session.userId, topicQuery]);

  useEffect(() => {
    if (!voiceListening) {
      setVoiceLevel(-2);
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
  }, [ripple, voiceListening]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(systemScale, {
        toValue: voiceListening ? 1.045 : 1,
        duration: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(systemOpacity, {
        toValue: voiceListening ? 0.58 : 0.82,
        duration: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    if (voiceListening) {
      lottieRef.current?.pause?.();
    } else {
      lottieRef.current?.play?.();
    }
  }, [systemOpacity, systemScale, voiceListening]);

  useEffect(() => {
    Animated.timing(processingOpacity, {
      toValue: processing ? 1 : 0,
      duration: processing ? 170 : 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [processing, processingOpacity]);

  const stepIndex = draft.stepIndex;
  const progress = (stepIndex + 1) / ONBOARDING_STEP_COUNT;

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progress,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [progress, progressAnim]);

  const animateStep = useCallback(
    (next: number) => {
      Animated.parallel([
        Animated.timing(fade, {
          toValue: 0,
          duration: 180,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 3,
          duration: 180,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(() => {
        patch({ stepIndex: next });
        fade.setValue(0);
        translateY.setValue(4);
        requestAnimationFrame(() => {
          Animated.parallel([
            Animated.timing(fade, {
              toValue: 1,
              duration: 280,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
            Animated.timing(translateY, {
              toValue: 0,
              duration: 280,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
          ]).start();
        });
      });
    },
    [fade, patch, translateY],
  );

  const goBack = useCallback(() => {
    if (stepIndex <= 0) return;
    hapticSelection();
    animateStep(stepIndex - 1);
  }, [animateStep, stepIndex]);

  const filteredTopics = useMemo(() => {
    const q = topicQuery.trim().toLowerCase();
    const source =
      topicSuggestions.length > 0
        ? topicSuggestions
        : [...ONBOARDING_TOPIC_SUGGESTIONS];
    if (!q) {
      return source;
    }
    return source.filter((t) => t.toLowerCase().includes(q));
  }, [topicQuery, topicSuggestions]);

  const countrySuggestions = useMemo(() => {
    const query = draft.country.trim().toLowerCase();
    if (!query) {
      return COUNTRY_OPTIONS.slice(0, 6);
    }
    return COUNTRY_OPTIONS.filter((country) =>
      country.toLowerCase().includes(query),
    ).slice(0, 6);
  }, [draft.country]);

  const summaryLabels = useMemo(
    () =>
      [
        ...draft.interests.slice(0, 3),
        draft.preferredFormat === "group"
          ? "Small groups"
          : draft.preferredFormat === "one_to_one"
            ? "1:1"
            : "1:1 + groups",
        draft.preferredAvailability,
        draft.area || draft.country,
      ].filter(Boolean) as string[],
    [draft],
  );

  const runInference = useCallback(
    async (rawInput?: string) => {
      const message = (rawInput ?? expressionDraft).trim();
      if (!message || processing) {
        return;
      }
      setProcessing(true);
      setExpressionDraft(message);
      patch({ onboardingIntakeText: message });
      try {
        let inferred = null as Awaited<
          ReturnType<typeof inferHybridOnboarding>
        > | null;
        try {
          const server = await api.inferOnboarding(
            session.userId,
            message,
            session.accessToken,
          );
          inferred = {
            draft: {
              ...draft,
              onboardingIntakeText: server.transcript,
              onboardingGoals: server.goals,
              interests: server.interests,
              preferredAvailability: server.availability,
              preferredFormat:
                server.format === "small_groups" ? "group" : server.format,
              preferredStyle: server.style,
              area: server.area,
              country: server.country,
              firstIntentText: server.firstIntent,
              persona: server.persona,
              personaSummary: server.summary,
              inferenceMeta: server.inferenceMeta,
            },
            persona: server.persona,
            summary: server.summary,
          };
        } catch {
          inferred = await inferHybridOnboarding(draft, message);
        }

        if (!inferred) {
          return;
        }
        setDraft((current) => ({
          ...current,
          ...inferred.draft,
          stepIndex: current.stepIndex,
        }));
        hapticSelection();
        animateStep(1);
      } finally {
        setProcessing(false);
      }
    },
    [
      animateStep,
      draft,
      expressionDraft,
      patch,
      processing,
      session.accessToken,
      session.userId,
    ],
  );

  const pickPhoto = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        t("onboardingPhotosTitle", locale),
        t("onboardingPhotosPermissionBody", locale),
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    patch({
      profilePhotoUri: asset.uri,
      profilePhotoMimeType: asset.mimeType ?? null,
      profilePhotoFileSize:
        typeof asset.fileSize === "number" ? asset.fileSize : null,
    });
  }, [locale, patch]);

  const clearPhoto = useCallback(() => {
    patch({
      profilePhotoUri: null,
      profilePhotoMimeType: null,
      profilePhotoFileSize: null,
    });
  }, [patch]);

  const finishWithIntent = useCallback(async () => {
    await onSubmit(draft, {
      firstIntentText:
        draft.firstIntentText.trim() ||
        draft.onboardingIntakeText.trim() ||
        null,
    });
  }, [draft, onSubmit]);

  const stageLabel = STAGE_LABELS[stepIndex] ?? STAGE_LABELS[0];

  const body = (
    <Animated.View
      style={[
        layout.body,
        {
          opacity: fade,
          transform: [{ translateY }],
        },
      ]}
    >
      {stepIndex === 0 ? (
        <ScrollView
          contentContainerStyle={layout.expressionContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          style={layout.scroll}
        >
          <View>
            <View className="items-center pt-6">
              <Text className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/28">
                OpenSocial
              </Text>
              <View className="mt-10 h-[248px] w-[248px] items-center justify-center">
                <Animated.View
                  className="absolute h-[210px] w-[210px] rounded-full border border-white/[0.08]"
                  style={{
                    opacity: ripple.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.22, 0],
                    }),
                    transform: [
                      {
                        scale: ripple.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.76, 1.18],
                        }),
                      },
                    ],
                  }}
                />
                <Animated.View
                  className="absolute h-[220px] w-[220px] rounded-full bg-white/[0.02]"
                  style={{
                    opacity: systemOpacity,
                    transform: [{ scale: systemScale }],
                  }}
                />
                <Animated.View
                  className="absolute h-[220px] w-[220px] items-center justify-center"
                  style={{
                    opacity: systemOpacity,
                    transform: [{ scale: systemScale }],
                  }}
                >
                  <SystemBlobAnimation
                    lottieRef={lottieRef}
                    size={layout.systemAnimation.width as number}
                  />
                </Animated.View>
              </View>
              <Text className="mt-10 text-center text-[34px] font-semibold leading-[38px] tracking-tight text-white">
                {t("onboardingHybridTitle", locale)}
              </Text>
              <Text className="mt-4 max-w-[320px] text-center text-[16px] leading-[24px] text-white/52">
                {t("onboardingHybridSubtitle", locale)}
              </Text>
            </View>

            <View className="mt-8 rounded-[26px] border border-white/[0.08] bg-white/[0.025] px-5 py-5">
              <Text className="text-[11px] font-medium uppercase tracking-[0.16em] text-white/30">
                Example
              </Text>
              <Text className="mt-3 text-[15px] leading-[24px] text-white/56">
                “I want to meet people who are into design and good
                conversations.”
              </Text>
            </View>
          </View>
        </ScrollView>
      ) : null}

      {stepIndex === 1 ? (
        <ScrollView
          contentContainerStyle={layout.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          style={layout.scroll}
        >
          <View className="gap-3">
            <Text className="text-[32px] font-semibold leading-tight tracking-tight text-white">
              {t("onboardingRefineTitle", locale)}
            </Text>
            <Text className="text-[16px] leading-[24px] text-white/55">
              {t("onboardingRefineSubtitle", locale)}
            </Text>
          </View>

          <View className="mt-8 gap-7">
            <Section title="Interests">
              {filteredTopics.map((label) => (
                <Chip
                  key={label}
                  label={label}
                  onPress={() => {
                    hapticSelection();
                    patch({
                      interests: toggleString(draft.interests, label),
                      inferenceMeta: {
                        ...draft.inferenceMeta,
                        interests: {
                          source: "manual",
                          confidence: 1,
                          needsConfirmation: false,
                        },
                      },
                    });
                  }}
                  selected={draft.interests.includes(label)}
                  testID={`onboarding-topic-${slugLabel(label)}`}
                />
              ))}
            </Section>

            <Section title="Mode">
              {["Social", "Dating", "Both"].map((label) => {
                const selected =
                  label === "Social"
                    ? draft.onboardingGoals.includes("Meet people") &&
                      !draft.onboardingGoals.includes("Dating")
                    : label === "Dating"
                      ? draft.onboardingGoals.includes("Dating") &&
                        !draft.onboardingGoals.includes("Meet people")
                      : draft.onboardingGoals.includes("Meet people") &&
                        draft.onboardingGoals.includes("Dating");
                return (
                  <Chip
                    key={label}
                    label={label}
                    onPress={() => {
                      hapticSelection();
                      if (label === "Social") {
                        patch({
                          onboardingGoals: uniqueGoals(
                            draft.onboardingGoals
                              .filter((goal) => goal !== "Dating")
                              .concat("Meet people"),
                          ),
                          inferenceMeta: {
                            ...draft.inferenceMeta,
                            goals: {
                              source: "manual",
                              confidence: 1,
                              needsConfirmation: false,
                            },
                          },
                        });
                        return;
                      }
                      if (label === "Dating") {
                        patch({
                          onboardingGoals: uniqueGoals(
                            draft.onboardingGoals
                              .filter((goal) => goal !== "Meet people")
                              .concat("Dating"),
                          ),
                          inferenceMeta: {
                            ...draft.inferenceMeta,
                            goals: {
                              source: "manual",
                              confidence: 1,
                              needsConfirmation: false,
                            },
                          },
                        });
                        return;
                      }
                      patch({
                        onboardingGoals: uniqueGoals(
                          draft.onboardingGoals.concat([
                            "Meet people",
                            "Dating",
                          ]),
                        ),
                        inferenceMeta: {
                          ...draft.inferenceMeta,
                          goals: {
                            source: "manual",
                            confidence: 1,
                            needsConfirmation: false,
                          },
                        },
                      });
                    }}
                    selected={selected}
                  />
                );
              })}
            </Section>

            <Section title="Format">
              {CONNECT_FORMAT_OPTIONS.map((option) => (
                <Chip
                  key={option.id}
                  label={option.label}
                  onPress={() => {
                    hapticSelection();
                    patch({
                      preferredFormat: option.id,
                      inferenceMeta: {
                        ...draft.inferenceMeta,
                        format: {
                          source: "manual",
                          confidence: 1,
                          needsConfirmation: false,
                        },
                      },
                    });
                  }}
                  selected={draft.preferredFormat === option.id}
                />
              ))}
            </Section>

            <Section title="Style">
              {STYLE_OPTIONS.map((label) => (
                <Chip
                  key={label}
                  label={label}
                  onPress={() => {
                    hapticSelection();
                    patch({
                      preferredStyle: label,
                      inferenceMeta: {
                        ...draft.inferenceMeta,
                        style: {
                          source: "manual",
                          confidence: 1,
                          needsConfirmation: false,
                        },
                      },
                    });
                  }}
                  selected={draft.preferredStyle === label}
                />
              ))}
            </Section>

            <Section title="Availability">
              {AVAILABILITY_OPTIONS.map((label) => (
                <Chip
                  key={label}
                  label={label}
                  onPress={() => {
                    hapticSelection();
                    patch({
                      preferredAvailability: label,
                      inferenceMeta: {
                        ...draft.inferenceMeta,
                        availability: {
                          source: "manual",
                          confidence: 1,
                          needsConfirmation: false,
                        },
                      },
                    });
                  }}
                  selected={draft.preferredAvailability === label}
                />
              ))}
            </Section>
          </View>
        </ScrollView>
      ) : null}

      {stepIndex === 2 ? (
        <ScrollView
          contentContainerStyle={layout.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          style={layout.scroll}
        >
          <View className="gap-3">
            <Text className="text-[32px] font-semibold leading-tight tracking-tight text-white">
              {t("onboardingPersonaTitle", locale)}
            </Text>
            <Text className="text-[16px] leading-[24px] text-white/55">
              {t("onboardingPersonaSubtitle", locale)}
            </Text>
          </View>

          <View className="mt-10 rounded-[30px] border border-white/[0.08] bg-white/[0.035] px-6 py-7">
            <Text className="text-[12px] font-medium uppercase tracking-[0.16em] text-white/32">
              Persona
            </Text>
            <Text className="mt-3 text-[34px] font-semibold leading-[38px] tracking-tight text-white">
              {draft.persona || "Explorer"}
            </Text>
            <Text className="mt-4 text-[16px] leading-[25px] text-white/62">
              {draft.personaSummary ||
                "You have clear intent and enough signal for us to shape your social setup."}
            </Text>
            <View className="mt-5 self-start rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5">
              <Text className="text-[12px] font-medium text-white/58">
                {metaLabel(
                  draft.inferenceMeta.persona.confidence,
                  draft.inferenceMeta.persona.needsConfirmation,
                )}
              </Text>
            </View>
          </View>

          {summaryLabels.length > 0 ? (
            <View className="mt-8 flex-row flex-wrap gap-2">
              {summaryLabels.map((label) => (
                <View
                  key={label}
                  className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5"
                >
                  <Text className="text-[12px] font-medium text-white/60">
                    {label}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          <View className="mt-8 gap-3">
            {(
              [
                { label: "Goals", meta: draft.inferenceMeta.goals },
                { label: "Interests", meta: draft.inferenceMeta.interests },
                { label: "Format", meta: draft.inferenceMeta.format },
                {
                  label: "Availability",
                  meta: draft.inferenceMeta.availability,
                },
                { label: "Location", meta: draft.inferenceMeta.location },
              ] as const
            ).map(({ label, meta }) => (
              <View
                key={label}
                className="flex-row items-center justify-between border-b border-white/[0.06] py-2"
              >
                <Text className="text-[14px] text-white/56">{label}</Text>
                <Text className="text-[12px] font-medium text-white/34">
                  {metaLabel(meta.confidence, meta.needsConfirmation)}
                </Text>
              </View>
            ))}
          </View>
        </ScrollView>
      ) : null}

      {stepIndex === 3 ? (
        <ScrollView
          contentContainerStyle={layout.profileStepContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          style={layout.scroll}
        >
          <View style={layout.profileStepColumn}>
            <View className="gap-3">
              <Text className="text-[32px] font-semibold leading-tight tracking-tight text-white">
                {t("onboardingProfileOptionalTitle", locale)}
              </Text>
              <Text className="text-[16px] leading-[24px] text-white/55">
                {t("onboardingProfileOptionalSubtitle", locale)}
              </Text>
            </View>

            <View style={layout.profileIdentity}>
              <Pressable
                accessibilityLabel={t("onboardingProfilePhotoLabel", locale)}
                accessibilityHint={t("onboardingProfilePhotoHint", locale)}
                className="h-[88px] w-[88px] items-center justify-center overflow-hidden rounded-full border border-white/15 bg-white/[0.06]"
                onPress={pickPhoto}
              >
                {draft.profilePhotoUri ? (
                  <Image
                    className="h-full w-full"
                    resizeMode="cover"
                    source={{ uri: draft.profilePhotoUri }}
                  />
                ) : (
                  <Ionicons
                    color="rgba(255,255,255,0.35)"
                    name="person"
                    size={36}
                  />
                )}
              </Pressable>
              <View className="items-center">
                <View className="mt-3 flex-row gap-4">
                  <Pressable onPress={pickPhoto}>
                    <Text className="text-[13px] text-white/50">
                      {draft.profilePhotoUri
                        ? t("commonChange", locale)
                        : t("onboardingAddPhoto", locale)}
                    </Text>
                  </Pressable>
                  {draft.profilePhotoUri ? (
                    <Pressable onPress={clearPhoto}>
                      <Text className="text-[13px] text-white/35">
                        {t("commonRemove", locale)}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            </View>

            <View style={layout.profileFields}>
              <CalmTextField
                autoCapitalize="words"
                label={t("onboardingProfileNameLabel", locale)}
                onChangeText={(text) =>
                  patch({
                    displayName: text,
                    inferenceMeta: {
                      ...draft.inferenceMeta,
                      persona: {
                        ...draft.inferenceMeta.persona,
                        needsConfirmation: false,
                      },
                    },
                  })
                }
                placeholder={t("onboardingProfileNamePlaceholder", locale)}
                returnKeyType="next"
                testID="onboarding-display-name"
                value={draft.displayName}
              />

              <CalmTextField
                helperText={t("onboardingProfileBioHelper", locale)}
                label={t("onboardingProfileBioLabel", locale)}
                multiline
                onChangeText={(text) =>
                  patch({
                    shortBio: text,
                    inferenceMeta: {
                      ...draft.inferenceMeta,
                      firstIntent: {
                        source: "manual",
                        confidence: 1,
                        needsConfirmation: false,
                      },
                    },
                  })
                }
                placeholder={t("onboardingProfileBioPlaceholder", locale)}
                scrollEnabled={false}
                testID="onboarding-bio-input"
                value={draft.shortBio}
              />

              <CalmTextField
                autoCapitalize="words"
                label={t("onboardingProfileAreaLabel", locale)}
                onChangeText={(text) =>
                  patch({
                    area: text,
                    inferenceMeta: {
                      ...draft.inferenceMeta,
                      location: {
                        source: "manual",
                        confidence: 1,
                        needsConfirmation: false,
                      },
                    },
                  })
                }
                placeholder={t("onboardingProfileAreaPlaceholder", locale)}
                returnKeyType="next"
                testID="onboarding-area-input"
                value={draft.area}
              />

              <View className="gap-2">
                <CalmTextField
                  autoCapitalize="words"
                  helperText={t("onboardingProfileCountryHelper", locale)}
                  label={t("onboardingProfileCountryLabel", locale)}
                  onBlur={() => setCountryFocused(false)}
                  onChangeText={(text) =>
                    patch({
                      country: text,
                      inferenceMeta: {
                        ...draft.inferenceMeta,
                        location: {
                          source: "manual",
                          confidence: 1,
                          needsConfirmation: false,
                        },
                      },
                    })
                  }
                  onFocus={() => setCountryFocused(true)}
                  placeholder={t("onboardingProfileCountryPlaceholder", locale)}
                  testID="onboarding-country-input"
                  value={draft.country}
                />
                {countryFocused || draft.country.trim().length > 0 ? (
                  <View className="flex-row flex-wrap gap-2">
                    {countrySuggestions.map((country) => (
                      <Pressable
                        key={country}
                        className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5"
                        onPress={() => {
                          patch({
                            country,
                            inferenceMeta: {
                              ...draft.inferenceMeta,
                              location: {
                                source: "manual",
                                confidence: 1,
                                needsConfirmation: false,
                              },
                            },
                          });
                          setCountryFocused(false);
                        }}
                      >
                        <Text className="text-[12px] font-medium text-white/60">
                          {country}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>
            </View>
          </View>
        </ScrollView>
      ) : null}
    </Animated.View>
  );

  const footer =
    stepIndex === 0 ? (
      <View className="gap-4">
        <View className="items-center justify-center" style={{ minHeight: 34 }}>
          <Text className="text-[12px] text-white/32">
            {voiceListening
              ? t("onboardingIntakeVoiceHint", locale)
              : t("onboardingIntakeVoiceHint", locale)}
          </Text>
          {!speechRecognitionAvailable() ? (
            <Text className="mt-2 max-w-[280px] text-center text-[12px] leading-[18px] text-white/28">
              {t("onboardingEntryVoiceUnavailable", locale)}
            </Text>
          ) : null}
        </View>

        <View className="items-center">
          <VoiceMicButton
            accessibilityLabelActive={t("onboardingEntryListening", locale)}
            accessibilityLabelIdle={t("onboardingHybridPrimaryVoice", locale)}
            activeLabel={t("onboardingEntryListening", locale)}
            className="w-full rounded-full border border-white/10 bg-white px-5 py-4"
            iconColorActive="#0d0d0d"
            iconColorIdle="#0d0d0d"
            iconSize={20}
            label={t("onboardingHybridPrimaryVoice", locale)}
            onFinalTranscript={(text) => {
              setVoiceListening(false);
              setVoiceLevel(-2);
              void runInference(text);
            }}
            onListeningChange={setVoiceListening}
            onVolumeChange={setVoiceLevel}
            liveLevel={voiceLevel}
            showLiveIndicator
          />
        </View>

        <Animated.View
          className="items-center px-3 py-1"
          style={{
            minHeight: 52,
            opacity: processingOpacity,
            transform: [
              {
                translateY: processingOpacity.interpolate({
                  inputRange: [0, 1],
                  outputRange: [4, 0],
                }),
              },
            ],
          }}
        >
          <View className="flex-row items-center gap-3 rounded-full border border-white/[0.08] bg-white/[0.03] px-4 py-2.5">
            {processing ? (
              <>
                <PremiumSpinner />
                <Text className="text-center text-[14px] leading-[22px] text-white/56">
                  {t("onboardingHybridProcessing", locale)}
                </Text>
              </>
            ) : (
              <Text className="text-center text-[14px] leading-[22px] text-transparent">
                {t("onboardingHybridProcessing", locale)}
              </Text>
            )}
          </View>
        </Animated.View>

        <Pressable
          accessibilityRole="button"
          className="items-center py-2"
          onPress={() => animateStep(1)}
        >
          <Text className="text-[14px] text-white/36">
            {t("onboardingHybridManual", locale)}
          </Text>
        </Pressable>
      </View>
    ) : stepIndex === 1 ? (
      <PrimaryButton
        disabled={loading}
        label={t("onboardingContinue", locale)}
        loading={loading}
        onPress={() => animateStep(2)}
        testID="onboarding-refine-continue"
      />
    ) : stepIndex === 2 ? (
      <View className="gap-3">
        <PrimaryButton
          disabled={loading}
          label={t("onboardingIntakePrimary", locale)}
          loading={loading}
          onPress={() => animateStep(3)}
          testID="onboarding-persona-use"
        />
        <Pressable
          accessibilityRole="button"
          className="items-center py-2"
          disabled={loading}
          onPress={() => animateStep(1)}
        >
          <Text className="text-[14px] text-white/40">
            {t("onboardingPersonaEdit", locale)}
          </Text>
        </Pressable>
      </View>
    ) : (
      <View className="gap-3">
        <PrimaryButton
          disabled={loading}
          label={t("onboardingContinue", locale)}
          loading={loading}
          onPress={() => void finishWithIntent()}
          testID="onboarding-profile-continue"
        />
        <Pressable
          accessibilityRole="button"
          className="items-center py-2"
          disabled={loading}
          onPress={() => void finishWithIntent()}
        >
          <Text className="text-[14px] text-white/40">
            {t("onboardingSkip", locale)}
          </Text>
        </Pressable>
      </View>
    );

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={layout.root}
      testID="onboarding-screen"
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={8}
        style={layout.fill}
      >
        <View className="px-5 pb-2 pt-1">
          <View className="h-1 overflow-hidden rounded-full bg-white/[0.08]">
            <Animated.View
              className="h-full rounded-full bg-white/35"
              style={{
                width: progressAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ["0%", "100%"],
                }),
              }}
            />
          </View>
          <View className="mt-2 flex-row items-center justify-between">
            <Text className="text-[11px] font-medium uppercase tracking-[0.16em] text-white/28">
              {stageLabel}
            </Text>
            {stepIndex > 0 ? (
              <Pressable
                accessibilityLabel={t("commonBack", locale)}
                className="flex-row items-center gap-1 py-2 pl-2"
                hitSlop={10}
                onPress={goBack}
              >
                <Ionicons
                  color="rgba(255,255,255,0.45)"
                  name="chevron-back"
                  size={20}
                />
                <Text className="text-[14px] text-white/45">
                  {t("commonBack", locale)}
                </Text>
              </Pressable>
            ) : (
              <View className="w-16" />
            )}
          </View>
        </View>

        {errorMessage ? (
          <View className="px-5 pb-2">
            <InlineNotice text={errorMessage} tone="error" />
          </View>
        ) : null}

        {body}

        {footer ? (
          <View className="border-t border-white/[0.06] px-6 py-4">
            {footer}
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function uniqueGoals(goals: string[]) {
  return [...new Set(goals)];
}

function metaLabel(confidence: number, needsConfirmation: boolean) {
  if (needsConfirmation) {
    return "Review";
  }
  if (confidence >= 0.8) {
    return "Strong signal";
  }
  if (confidence >= 0.6) {
    return "Likely";
  }
  return "Light signal";
}

const layout = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#050506",
  },
  fill: {
    flex: 1,
  },
  body: {
    flex: 1,
    minHeight: 0,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 28,
    paddingTop: 18,
  },
  expressionContent: {
    flexGrow: 1,
    paddingHorizontal: 28,
    paddingBottom: 40,
    paddingTop: 12,
  },
  systemAnimation: {
    width: 244,
    height: 244,
    opacity: 0.72,
  },
  profileStepContent: {
    paddingHorizontal: 20,
    paddingBottom: 28,
    paddingTop: 18,
  },
  profileStepColumn: {
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
    gap: 18,
  },
  profileIdentity: {
    alignItems: "center",
    paddingTop: 4,
    paddingBottom: 2,
  },
  profileFields: {
    gap: 16,
  },
});
