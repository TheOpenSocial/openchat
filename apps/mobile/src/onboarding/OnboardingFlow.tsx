import Ionicons from "@expo/vector-icons/Ionicons";
import * as ImagePicker from "expo-image-picker";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Easing,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { CalmTextField } from "../components/CalmTextField";
import { InlineNotice } from "../components/InlineNotice";
import { PrimaryButton } from "../components/PrimaryButton";
import { SystemBlobAnimation } from "../components/SystemBlobAnimation";
import { VoiceMicButton } from "../components/VoiceMicButton";
import { type AppLocale, t } from "../i18n/strings";
import { api } from "../lib/api";
import { hapticSelection } from "../lib/haptics";
import { speechRecognitionAvailable } from "../lib/speech-recognition-available";
import { appTheme } from "../theme";
import type { MobileSession } from "../types";
import { COUNTRY_OPTIONS, guessCountryFromLocale } from "./country-options";
import {
  defaultOnboardingState,
  mergeLoadedDraft,
  ONBOARDING_GOAL_OPTIONS,
  ONBOARDING_STEP_COUNT,
  ONBOARDING_TOPIC_SUGGESTIONS,
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

function normalizeSearchValue(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
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
        selected ? "border-ink bg-ink" : "border-hairline bg-surfaceMuted/70"
      }`}
      onPress={onPress}
      testID={testID}
    >
      <Text
        className={`text-[14px] font-medium ${
          selected ? "text-canvas" : "text-muted"
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
      <Text className="text-[12px] font-medium uppercase tracking-[0.14em] text-muted">
        {title}
      </Text>
      <View className="flex-row flex-wrap gap-2">{children}</View>
    </View>
  );
}

function StepHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View className="items-center gap-3">
      <Text className="text-center text-[30px] font-semibold leading-[34px] tracking-tight text-ink">
        {title}
      </Text>
      <Text className="max-w-[320px] text-center text-[15px] leading-[23px] text-muted">
        {subtitle}
      </Text>
    </View>
  );
}

function SurfaceCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <View
      className={`rounded-[24px] border border-hairline bg-surfaceMuted/60 px-5 py-5 ${className}`}
    >
      {children}
    </View>
  );
}

function MetaPill({ children }: { children: React.ReactNode }) {
  return (
    <View className="rounded-full border border-hairline bg-surfaceMuted/70 px-2.5 py-1">
      <Text className="text-[10px] font-medium text-muted">{children}</Text>
    </View>
  );
}

function SelectorField({
  label,
  value,
  placeholder,
  onPress,
}: {
  label: string;
  value: string;
  placeholder: string;
  onPress: () => void;
}) {
  return (
    <View className="gap-1.5">
      <Text className="text-[12px] font-medium text-muted">{label}</Text>
      <Pressable
        accessibilityRole="button"
        className="overflow-hidden rounded-[22px] border border-hairline bg-surfaceMuted/70 px-4 py-3"
        onPress={onPress}
        style={({ pressed }) => ({
          transform: [{ scale: pressed ? 0.995 : 1 }],
        })}
      >
        <View className="flex-row items-center justify-between gap-3">
          <Text
            className={`flex-1 text-[15px] leading-[22px] ${
              value.trim() ? "text-ink" : "text-muted"
            }`}
            numberOfLines={1}
          >
            {value.trim() || placeholder}
          </Text>
          <Ionicons
            color={appTheme.colors.muted}
            name="chevron-down"
            size={18}
          />
        </View>
      </Pressable>
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
  const showAutomationBypass =
    __DEV__ || Boolean(process.env.EXPO_PUBLIC_E2E_SESSION);
  const [draft, setDraft] = useState<OnboardingDraftState>(() =>
    defaultOnboardingState(session.displayName),
  );
  const [expressionDraft, setExpressionDraft] = useState("");
  const [processing, setProcessing] = useState(false);
  const [refiningPersona, setRefiningPersona] = useState(false);
  const [backgroundHydrating, setBackgroundHydrating] = useState(false);
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceLevel, setVoiceLevel] = useState(-2);
  const [lastSpokenTurn, setLastSpokenTurn] = useState("");
  const [topicQuery] = useState("");
  const [topicSuggestions, setTopicSuggestions] = useState<string[]>([]);
  const [countrySelectorOpen, setCountrySelectorOpen] = useState(false);
  const [countryQuery, setCountryQuery] = useState("");
  const [processingPhraseIndex, setProcessingPhraseIndex] = useState(0);
  const fade = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(
    new Animated.Value(1 / ONBOARDING_STEP_COUNT),
  ).current;
  const ripple = useRef(new Animated.Value(0)).current;
  const systemScale = useRef(new Animated.Value(1)).current;
  const systemOpacity = useRef(new Animated.Value(0.82)).current;
  const processingOpacity = useRef(new Animated.Value(0)).current;
  const inferOverlayOpacity = useRef(new Animated.Value(0)).current;
  const lottieRef = useRef<{ pause?: () => void; play?: () => void } | null>(
    null,
  );
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const patch = useCallback((partial: Partial<OnboardingDraftState>) => {
    setDraft((d) => ({ ...d, ...partial }));
  }, []);

  const applyRichInference = useCallback(
    (
      transcript: string,
      server: Awaited<ReturnType<typeof api.inferOnboarding>>,
      options?: { stepIndex?: number },
    ) => {
      setDraft((current) => ({
        ...current,
        onboardingIntakeText: transcript,
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
        followUpQuestion: server.followUpQuestion?.trim() ?? "",
        inferenceMeta: server.inferenceMeta,
        stepIndex: options?.stepIndex ?? current.stepIndex,
      }));
    },
    [],
  );

  const hydrateRichInference = useCallback(
    async (transcript: string, options?: { silent?: boolean }) => {
      if (!options?.silent) {
        setRefiningPersona(true);
      } else {
        setBackgroundHydrating(true);
      }
      try {
        const server = await api.inferOnboarding(
          session.userId,
          transcript,
          session.accessToken,
        );
        applyRichInference(transcript, server);
      } catch (error) {
        console.warn("onboarding rich inference failed", error);
        if (!options?.silent) {
          Alert.alert(
            t("onboardingRefinementUnavailableTitle", locale),
            t("onboardingRefinementUnavailableBody", locale),
            [{ text: "OK" }],
          );
        }
      } finally {
        if (!options?.silent) {
          setRefiningPersona(false);
        } else {
          setBackgroundHydrating(false);
        }
      }
    },
    [applyRichInference, locale, session.accessToken, session.userId],
  );

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

  const inferOverlayVisible = processing || refiningPersona;

  useEffect(() => {
    Animated.timing(inferOverlayOpacity, {
      toValue: inferOverlayVisible ? 1 : 0,
      duration: inferOverlayVisible ? 180 : 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [inferOverlayOpacity, inferOverlayVisible]);

  const processingPhrases = useMemo(
    () => [
      t("onboardingHybridProcessingWordOne", locale),
      t("onboardingHybridProcessingWordTwo", locale),
      t("onboardingHybridProcessingWordThree", locale),
    ],
    [locale],
  );

  useEffect(() => {
    if (!inferOverlayVisible) {
      setProcessingPhraseIndex(0);
      return;
    }

    const interval = setInterval(() => {
      setProcessingPhraseIndex((current) =>
        current === processingPhrases.length - 1 ? 0 : current + 1,
      );
    }, 2400);

    return () => clearInterval(interval);
  }, [inferOverlayVisible, processingPhrases.length]);

  const stepIndex = draft.stepIndex;
  const progress = (stepIndex + 1) / ONBOARDING_STEP_COUNT;
  const followUpQuestion = draft.followUpQuestion.trim();
  const hasFollowUpQuestion = followUpQuestion.length > 0;
  const voiceActionLabel = hasFollowUpQuestion
    ? t("onboardingHybridAnswerVoice", locale)
    : t("onboardingHybridPrimaryVoice", locale);
  const voiceHint = hasFollowUpQuestion
    ? t("onboardingHybridFollowUpVoiceHint", locale)
    : t("onboardingIntakeVoiceHint", locale);

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
    const query = normalizeSearchValue(countryQuery || draft.country);
    if (!query) {
      return COUNTRY_OPTIONS;
    }

    return COUNTRY_OPTIONS.map((country) => {
      const haystack = normalizeSearchValue(country);
      const startsWith = haystack.startsWith(query);
      const includes = haystack.includes(query);
      return {
        country,
        rank: startsWith ? 0 : includes ? 1 : 2,
      };
    })
      .filter((entry) => entry.rank < 2)
      .sort((left, right) =>
        left.rank === right.rank
          ? left.country.localeCompare(right.country, "en")
          : left.rank - right.rank,
      )
      .map((entry) => entry.country);
  }, [countryQuery, draft.country]);

  const trustSignals = useMemo(
    () =>
      [
        {
          label: t("onboardingPersonaSignalGoals", locale),
          value: draft.onboardingGoals.length
            ? draft.onboardingGoals.slice(0, 2).join(" · ")
            : "Add a couple of goals",
          meta: draft.inferenceMeta.goals,
        },
        {
          label: t("onboardingPersonaSignalInterests", locale),
          value: draft.interests.length
            ? draft.interests.slice(0, 3).join(" · ")
            : "Add a few interests",
          meta: draft.inferenceMeta.interests,
        },
        {
          label: t("onboardingPersonaSignalFormat", locale),
          value:
            draft.preferredFormat === "one_to_one"
              ? "1:1"
              : draft.preferredFormat === "group"
                ? "Small groups"
                : "1:1 + groups",
          meta: draft.inferenceMeta.format,
        },
        {
          label: t("onboardingPersonaSignalLocation", locale),
          value:
            [draft.area.trim(), draft.country.trim()]
              .filter(Boolean)
              .join(" · ") || "Add a location",
          meta: draft.inferenceMeta.location,
        },
      ] as const,
    [draft, locale],
  );

  const runInference = useCallback(
    async (rawInput?: string) => {
      const message = (rawInput ?? expressionDraft).trim();
      if (!message || processing) {
        return;
      }
      const transcript = hasFollowUpQuestion
        ? `${draft.onboardingIntakeText.trim()}\n\nFollow-up question: ${followUpQuestion}\nAnswer: ${message}`.trim()
        : message;
      setProcessing(true);
      setLastSpokenTurn(message);
      setExpressionDraft(message);
      patch({
        onboardingIntakeText: transcript,
        followUpQuestion: hasFollowUpQuestion ? followUpQuestion : "",
      });
      try {
        const server = await api.inferOnboardingQuick(
          session.userId,
          transcript,
          session.accessToken,
        );
        setDraft((current) => ({
          ...current,
          onboardingIntakeText: transcript,
          onboardingGoals: server.goals,
          interests: server.interests,
          firstIntentText: server.firstIntent,
          personaSummary: server.summary,
          followUpQuestion: server.followUpQuestion?.trim() ?? "",
          stepIndex: current.stepIndex,
        }));
        hapticSelection();
        if (!(server.followUpQuestion?.trim() ?? "")) {
          animateStep(1);
          void hydrateRichInference(transcript, { silent: true });
        }
      } catch (error) {
        console.warn("onboarding inference failed", error);
        Alert.alert(
          t("onboardingInferenceUnavailableTitle", locale),
          t("onboardingInferenceUnavailableBody", locale),
          [{ text: "OK" }],
        );
      } finally {
        setProcessing(false);
      }
    },
    [
      animateStep,
      draft.onboardingIntakeText,
      draft,
      expressionDraft,
      followUpQuestion,
      hasFollowUpQuestion,
      locale,
      patch,
      processing,
      hydrateRichInference,
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
      allowsEditing: Platform.OS !== "ios",
      ...(Platform.OS !== "ios" ? { aspect: [9, 16] as [number, number] } : {}),
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

  const refreshPersonaFromRefinement = useCallback(async () => {
    if (refiningPersona) {
      return;
    }

    const transcript = [
      draft.onboardingIntakeText.trim(),
      draft.onboardingGoals.length
        ? `Goals: ${draft.onboardingGoals.join(", ")}.`
        : "",
      draft.interests.length ? `Interests: ${draft.interests.join(", ")}.` : "",
      draft.area.trim() ? `Area: ${draft.area.trim()}.` : "",
      draft.country.trim() ? `Country: ${draft.country.trim()}.` : "",
    ]
      .filter(Boolean)
      .join("\n");

    await hydrateRichInference(transcript);
    hapticSelection();
    animateStep(2);
  }, [
    animateStep,
    draft.area,
    draft.country,
    draft.interests,
    draft.onboardingGoals,
    draft.onboardingIntakeText,
    hydrateRichInference,
    refiningPersona,
  ]);

  const finishWithIntent = useCallback(async () => {
    await onSubmit(draft, {
      firstIntentText:
        draft.firstIntentText.trim() ||
        draft.onboardingIntakeText.trim() ||
        null,
    });
  }, [draft, onSubmit]);

  const finishWithAutomationBypass = useCallback(async () => {
    await onSubmit(
      {
        ...draft,
        stepIndex: ONBOARDING_STEP_COUNT - 1,
      },
      {
        firstIntentText:
          draft.firstIntentText.trim() ||
          draft.onboardingIntakeText.trim() ||
          "Find people to talk with today",
      },
    );
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
            <View className="items-center pt-4">
              <Text className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted">
                OpenSocial
              </Text>
              <View className="mt-7 h-[204px] w-[204px] items-center justify-center">
                <Animated.View
                  className="absolute h-[184px] w-[184px] rounded-full border border-hairline/70"
                  style={{
                    opacity: ripple.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.16, 0],
                    }),
                    transform: [
                      {
                        scale: ripple.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.82, 1.12],
                        }),
                      },
                    ],
                  }}
                />
                <Animated.View
                  className="absolute h-[188px] w-[188px] rounded-full bg-surfaceMuted/40"
                  style={{
                    opacity: systemOpacity,
                    transform: [{ scale: systemScale }],
                  }}
                />
                <Animated.View
                  className="absolute h-[188px] w-[188px] items-center justify-center"
                  style={{
                    opacity: systemOpacity,
                    transform: [{ scale: systemScale }],
                  }}
                >
                  <SystemBlobAnimation lottieRef={lottieRef} size={176} />
                </Animated.View>
              </View>
              <Text className="mt-7 text-center text-[32px] font-semibold leading-[36px] tracking-tight text-ink">
                {t("onboardingHybridTitle", locale)}
              </Text>
              <Text className="mt-4 max-w-[300px] text-center text-[15px] leading-[23px] text-muted">
                {hasFollowUpQuestion
                  ? t("onboardingHybridFollowUpSubtitle", locale)
                  : t("onboardingHybridSubtitle", locale)}
              </Text>
            </View>

            <View
              className="mt-7 rounded-[24px] border border-hairline bg-surfaceMuted/50 px-5 py-4"
              style={layout.expressionSignalCard}
            >
              {processing && lastSpokenTurn.trim().length > 0 ? (
                <>
                  <Text className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
                    {t("onboardingHybridProcessingLabel", locale)}
                  </Text>
                  <Text className="mt-3 text-[13px] leading-[20px] text-muted">
                    {t("onboardingHybridProcessing", locale)}
                  </Text>
                  <Text className="mt-3 text-[17px] leading-[27px] text-ink/90">
                    "{lastSpokenTurn.trim()}"
                  </Text>
                  <Text className="mt-2 text-[13px] leading-[21px] text-muted">
                    {t("onboardingHybridProcessingHint", locale)}
                  </Text>
                </>
              ) : hasFollowUpQuestion ? (
                <>
                  <Text className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
                    {t("onboardingHybridFollowUpTitle", locale)}
                  </Text>
                  <Text className="mt-3 text-[17px] leading-[27px] text-ink/90">
                    {followUpQuestion}
                  </Text>
                  <Text className="mt-2 text-[13px] leading-[21px] text-muted">
                    {t("onboardingHybridFollowUpHint", locale)}
                  </Text>
                </>
              ) : (
                <>
                  <Text className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
                    {t("onboardingHybridExampleLabel", locale)}
                  </Text>
                  <Text className="mt-3 text-[16px] leading-[25px] text-ink/88">
                    {t("onboardingHybridExampleText", locale)}
                  </Text>
                  <Text className="mt-3 text-[13px] leading-[21px] text-muted">
                    {t("onboardingHybridExampleHint", locale)}
                  </Text>
                </>
              )}
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
          <View style={layout.stepColumn}>
            <StepHeading
              subtitle={t("onboardingRefineSubtitle", locale)}
              title={t("onboardingRefineTitle", locale)}
            />

            {backgroundHydrating ? (
              <View className="mt-6 items-center">
                <Text className="text-center text-[12px] leading-[18px] text-muted">
                  We’re shaping a richer read in the background.
                </Text>
              </View>
            ) : null}

            <View className="mt-8 gap-4">
              <SurfaceCard>
                <Text className="mb-3 text-[12px] leading-[18px] text-muted">
                  Add a few topics you want OpenSocial to prioritize first. We
                  can tune the rest as the system learns what works for you.
                </Text>
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
              </SurfaceCard>

              <SurfaceCard>
                <Text className="mb-3 text-[12px] leading-[18px] text-muted">
                  Sharpen the outcome you want first. This helps the system
                  craft a stronger read of your intent and persona.
                </Text>
                <Section title="Goals">
                  {ONBOARDING_GOAL_OPTIONS.map((label) => (
                    <Chip
                      key={label}
                      label={label}
                      onPress={() => {
                        hapticSelection();
                        patch({
                          onboardingGoals: toggleString(
                            draft.onboardingGoals,
                            label,
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
                      selected={draft.onboardingGoals.includes(label)}
                    />
                  ))}
                </Section>
              </SurfaceCard>

              <SurfaceCard>
                <Text className="mb-3 text-[12px] leading-[18px] text-muted">
                  Add a light location anchor if place matters for this.
                </Text>
                <View className="gap-3">
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
                    value={draft.area}
                  />
                  <SelectorField
                    label={t("onboardingProfileCountryLabel", locale)}
                    onPress={() => {
                      setCountryQuery(draft.country);
                      setCountrySelectorOpen(true);
                    }}
                    placeholder={t(
                      "onboardingProfileCountryPlaceholder",
                      locale,
                    )}
                    value={draft.country}
                  />
                </View>
              </SurfaceCard>
            </View>
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
          <View style={layout.stepColumn}>
            <StepHeading
              subtitle={t("onboardingPersonaSubtitle", locale)}
              title={t("onboardingPersonaTitle", locale)}
            />

            <SurfaceCard className="mt-8 items-center">
              <Text className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
                Persona
              </Text>
              <Text className="mt-4 text-center text-[30px] font-semibold leading-[34px] tracking-tight text-ink">
                {draft.persona || "Explorer"}
              </Text>
              <Text className="mt-4 max-w-[316px] text-center text-[15px] leading-[24px] text-muted">
                {draft.personaSummary ||
                  "You have clear intent and enough signal for us to shape your social setup."}
              </Text>
              <View className="mt-5 flex-row flex-wrap items-center justify-center gap-2">
                <MetaPill>
                  {metaLabel(
                    draft.inferenceMeta.persona.confidence,
                    draft.inferenceMeta.persona.needsConfirmation,
                  )}
                </MetaPill>
                <Text className="text-[11px] leading-[16px] text-muted">
                  {t("onboardingPersonaEditHint", locale)}
                </Text>
              </View>
            </SurfaceCard>

            <SurfaceCard className="mt-4">
              <View className="flex-row items-center justify-between">
                <Text className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted">
                  {t("onboardingPersonaSignalTitle", locale)}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => animateStep(1)}
                >
                  <Text className="text-[11px] font-medium text-muted">
                    {t("onboardingPersonaEdit", locale)}
                  </Text>
                </Pressable>
              </View>
              <View className="mt-3 gap-0">
                {trustSignals.map((signal, index) => (
                  <View key={signal.label}>
                    {index > 0 ? (
                      <View className="h-px bg-hairline/70" />
                    ) : null}
                    <View className="flex-row items-start justify-between gap-4 py-3.5">
                      <View className="flex-1 gap-1">
                        <Text className="text-[11px] uppercase tracking-[0.14em] text-muted">
                          {signal.label}
                        </Text>
                        <Text className="text-[14px] leading-[21px] text-ink/90">
                          {signal.value}
                        </Text>
                      </View>
                      <MetaPill>
                        {metaLabel(
                          signal.meta.confidence,
                          signal.meta.needsConfirmation,
                        )}
                      </MetaPill>
                    </View>
                  </View>
                ))}
              </View>
            </SurfaceCard>
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
            <StepHeading
              subtitle={t("onboardingProfileOptionalSubtitle", locale)}
              title={t("onboardingProfileOptionalTitle", locale)}
            />

            <SurfaceCard className="mt-8 items-center">
              <Pressable
                accessibilityHint={t("onboardingProfilePhotoHint", locale)}
                accessibilityLabel={t("onboardingProfilePhotoLabel", locale)}
                className="h-[88px] w-[88px] items-center justify-center overflow-hidden rounded-full border border-hairline bg-surfaceMuted/75"
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
                    color={appTheme.colors.muted}
                    name="person"
                    size={36}
                  />
                )}
              </Pressable>
              <View className="items-center">
                <View className="mt-3 flex-row gap-4">
                  <Pressable onPress={pickPhoto}>
                    <Text className="text-[13px] text-muted">
                      {draft.profilePhotoUri
                        ? t("commonChange", locale)
                        : t("onboardingAddPhoto", locale)}
                    </Text>
                  </Pressable>
                  {draft.profilePhotoUri ? (
                    <Pressable onPress={clearPhoto}>
                      <Text className="text-[13px] text-muted">
                        {t("commonRemove", locale)}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            </SurfaceCard>

            <SurfaceCard className="mt-4">
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
                  <SelectorField
                    label={t("onboardingProfileCountryLabel", locale)}
                    onPress={() => {
                      setCountryQuery(draft.country);
                      setCountrySelectorOpen(true);
                    }}
                    placeholder={t(
                      "onboardingProfileCountryPlaceholder",
                      locale,
                    )}
                    value={draft.country}
                  />
                  <Text className="text-[12px] leading-[18px] text-muted">
                    {t("onboardingProfileCountryHelper", locale)}
                  </Text>
                </View>
              </View>
            </SurfaceCard>
          </View>
        </ScrollView>
      ) : null}
    </Animated.View>
  );

  const footer =
    stepIndex === 0 ? (
      <View className="gap-3">
        <View className="items-center justify-center" style={{ minHeight: 24 }}>
          {!speechRecognitionAvailable() ? (
            <Text className="max-w-[280px] text-center text-[12px] leading-[18px] text-muted">
              {t("onboardingEntryVoiceUnavailable", locale)}
            </Text>
          ) : hasFollowUpQuestion ? (
            <Text className="text-[12px] text-muted">{voiceHint}</Text>
          ) : null}
        </View>

        <View className="items-center">
          <VoiceMicButton
            accessibilityLabelActive={t("onboardingEntryListening", locale)}
            accessibilityLabelIdle={voiceActionLabel}
            activeLabel={t("onboardingEntryListening", locale)}
            className="w-full rounded-full border border-hairline bg-ink px-5"
            disabled={processing}
            iconColorActive={appTheme.colors.background}
            iconColorIdle={appTheme.colors.background}
            iconSize={18}
            label={voiceActionLabel}
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
            minHeight: 44,
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
          <View className="flex-row items-center gap-3 rounded-full border border-hairline bg-surfaceMuted/55 px-4 py-2">
            {processing ? (
              <Text className="text-center text-[14px] leading-[22px] text-muted">
                {t("onboardingHybridProcessingInline", locale)}
              </Text>
            ) : (
              <Text className="text-center text-[14px] leading-[22px] text-transparent">
                {t("onboardingHybridProcessingInline", locale)}
              </Text>
            )}
          </View>
        </Animated.View>

        <Pressable
          accessibilityRole="button"
          className="items-center py-2"
          disabled={processing}
          onPress={() => {
            patch({ followUpQuestion: "" });
            animateStep(1);
          }}
        >
          <Text className="text-[14px] text-muted">
            {t("onboardingHybridManual", locale)}
          </Text>
        </Pressable>
        {showAutomationBypass ? (
          <Pressable
            accessibilityRole="button"
            className="items-center py-2"
            disabled={processing || loading}
            onPress={() => {
              void finishWithAutomationBypass();
            }}
            testID="onboarding-e2e-bypass-button"
          >
            <Text className="text-[14px] text-muted">Continue to app</Text>
          </Pressable>
        ) : null}
      </View>
    ) : stepIndex === 1 ? (
      <PrimaryButton
        disabled={loading || refiningPersona}
        label={t("onboardingContinue", locale)}
        loading={loading || refiningPersona}
        onPress={() => void refreshPersonaFromRefinement()}
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
          <Text className="text-[14px] text-muted">
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
          <Text className="text-[14px] text-muted">
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
          <View className="h-1 overflow-hidden rounded-full bg-hairline/70">
            <Animated.View
              className="h-full rounded-full bg-ink"
              style={{
                width: progressAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ["0%", "100%"],
                }),
              }}
            />
          </View>
          <View className="mt-2 flex-row items-center justify-between">
            <Text className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
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
                  color={appTheme.colors.muted}
                  name="chevron-back"
                  size={20}
                />
                <Text className="text-[14px] text-muted">
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
          <View className="border-t border-hairline px-6 py-4">{footer}</View>
        ) : null}

        <Animated.View
          pointerEvents={inferOverlayVisible ? "auto" : "none"}
          style={[
            StyleSheet.absoluteFillObject,
            layout.inferOverlay,
            {
              opacity: inferOverlayOpacity,
            },
          ]}
        >
          <Animated.View
            style={[
              layout.inferOverlayInner,
              {
                opacity: inferOverlayOpacity.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.6, 1],
                }),
                transform: [
                  {
                    translateY: inferOverlayOpacity.interpolate({
                      inputRange: [0, 1],
                      outputRange: [10, 0],
                    }),
                  },
                  {
                    scale: inferOverlayOpacity.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.985, 1],
                    }),
                  },
                ],
              },
            ]}
          >
            <View className="items-center">
              <View className="h-[204px] w-[204px] items-center justify-center">
                <View className="absolute h-[184px] w-[184px] rounded-full border border-hairline/80 bg-surfaceMuted/50" />
                <SystemBlobAnimation size={180} />
              </View>
            </View>
            <View className="items-center gap-3">
              <Text className="text-center text-[32px] font-semibold leading-[36px] tracking-tight text-ink">
                {t("onboardingHybridProcessingTitle", locale)}
              </Text>
              <Text className="max-w-[316px] text-center text-[16px] leading-[24px] text-muted">
                {t("onboardingHybridProcessing", locale)}
              </Text>
              <Text className="max-w-[300px] text-center text-[13px] leading-[21px] text-muted">
                {processingPhrases[processingPhraseIndex]}
              </Text>
            </View>
            <View className="items-center gap-2">
              {lastSpokenTurn.trim().length > 0 ? (
                <Text className="max-w-[292px] text-center text-[13px] leading-[21px] text-muted">
                  "{lastSpokenTurn.trim()}"
                </Text>
              ) : null}
            </View>
          </Animated.View>
        </Animated.View>
      </KeyboardAvoidingView>

      <Modal
        animationType="slide"
        onRequestClose={() => setCountrySelectorOpen(false)}
        transparent
        visible={countrySelectorOpen}
      >
        <View className="flex-1 justify-end bg-canvas/72 px-3 pb-3">
          <View className="max-h-[78%] rounded-[30px] border border-hairline/80 bg-canvas px-5 pb-5 pt-4">
            <View className="mb-4 items-center gap-3">
              <View className="h-1.5 w-12 rounded-full bg-hairline/70" />
              <View className="w-full flex-row items-center justify-between">
                <View className="gap-1">
                  <Text className="text-[18px] font-semibold tracking-tight text-ink">
                    {t("onboardingProfileCountryLabel", locale)}
                  </Text>
                  <Text className="text-[13px] leading-[18px] text-muted">
                    {t("onboardingCountrySelectorHint", locale)}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  hitSlop={10}
                  onPress={() => setCountrySelectorOpen(false)}
                >
                  <Ionicons
                    color={appTheme.colors.muted}
                    name="close"
                    size={22}
                  />
                </Pressable>
              </View>
            </View>

            <View className="mb-3 flex-row items-center gap-3 overflow-hidden rounded-[22px] border border-hairline bg-surfaceMuted/70 px-4 py-3">
              <Ionicons color={appTheme.colors.muted} name="search" size={16} />
              <TextInput
                autoCapitalize="words"
                autoCorrect={false}
                className="flex-1 text-[15px] leading-[22px] text-ink"
                onChangeText={setCountryQuery}
                placeholder={t("commonSearch", locale)}
                placeholderTextColor={appTheme.colors.muted}
                returnKeyType="search"
                selectionColor={appTheme.colors.ink}
                value={countryQuery}
              />
            </View>

            <FlatList
              data={countrySuggestions}
              initialNumToRender={20}
              keyboardShouldPersistTaps="handled"
              keyExtractor={(country) => country}
              renderItem={({ item: country }) => (
                <Pressable
                  className="flex-row items-center justify-between px-1 py-3.5"
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
                    setCountrySelectorOpen(false);
                  }}
                >
                  <Text className="text-[16px] text-ink">{country}</Text>
                  {draft.country === country ? (
                    <Ionicons
                      color={appTheme.colors.ink}
                      name="checkmark"
                      size={18}
                    />
                  ) : null}
                </Pressable>
              )}
              ItemSeparatorComponent={() => (
                <View className="h-px bg-hairline/70" />
              )}
              ListEmptyComponent={
                <Text className="px-1 py-3 text-[13px] text-muted">
                  {t("onboardingCountrySelectorEmpty", locale)}
                </Text>
              }
              showsVerticalScrollIndicator={false}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function metaLabel(confidence: number, needsConfirmation: boolean) {
  if (needsConfirmation) {
    return "Review";
  }
  if (confidence >= 0.8) {
    return "Confirmed";
  }
  if (confidence >= 0.6) {
    return "Likely";
  }
  return "Light";
}

const layout = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: appTheme.colors.background,
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
  stepColumn: {
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
  },
  expressionContent: {
    flexGrow: 1,
    paddingHorizontal: 28,
    paddingBottom: 40,
    paddingTop: 12,
  },
  expressionSignalCard: {
    minHeight: 160,
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
  profileFields: {
    gap: 16,
  },
  inferOverlay: {
    backgroundColor: appTheme.colors.background,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 28,
    paddingTop: 24,
    paddingBottom: 40,
  },
  inferOverlayInner: {
    width: "100%",
    maxWidth: 344,
    alignItems: "center",
    gap: 36,
  },
});
