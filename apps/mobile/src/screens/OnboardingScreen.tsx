import { type Dispatch, type SetStateAction, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AnimatedScreen } from "../components/AnimatedScreen";
import { ChoiceChip } from "../components/ChoiceChip";
import { InlineNotice } from "../components/InlineNotice";
import { PrimaryButton } from "../components/PrimaryButton";
import {
  type OnboardingAvailability,
  type OnboardingFormat,
  type OnboardingMode,
  type OnboardingStyle,
  type SocialMode,
  type UserProfileDraft,
} from "../types";

interface OnboardingScreenProps {
  defaultName: string;
  onComplete: (profile: UserProfileDraft) => Promise<void>;
  loading: boolean;
  errorMessage: string | null;
}

type OnboardingStep =
  | "welcome"
  | "goals"
  | "interests"
  | "preferences"
  | "profile"
  | "intent";

const steps: OnboardingStep[] = [
  "welcome",
  "goals",
  "interests",
  "preferences",
  "profile",
  "intent",
];

const goalOptions = [
  "Meet people",
  "Talk about interests",
  "Find things to do",
  "Make plans",
  "Join small groups",
  "Explore",
  "Dating",
  "Gaming",
  "Ideas",
] as const;

const interestOptions = [
  "AI",
  "Design",
  "Football",
  "Gaming",
  "Running",
  "Startups",
  "Tennis",
  "Film",
  "Music",
  "Coffee",
  "Fitness",
  "Books",
  "Founders",
  "Travel",
  "Creators",
  "Cooking",
  "Padel",
  "Basketball",
] as const;

const availabilityOptions: Array<{
  label: string;
  value: OnboardingAvailability;
}> = [
  { label: "Now", value: "now" },
  { label: "Evenings", value: "evenings" },
  { label: "Weekends", value: "weekends" },
  { label: "Flexible", value: "flexible" },
];

const formatOptions: Array<{ label: string; value: OnboardingFormat }> = [
  { label: "1:1", value: "one_to_one" },
  { label: "Small groups", value: "small_groups" },
  { label: "Both", value: "both" },
];

const modeOptions: Array<{ label: string; value: OnboardingMode }> = [
  { label: "Online", value: "online" },
  { label: "In person", value: "in_person" },
  { label: "Both", value: "both" },
];

const styleOptions: Array<{ label: string; value: OnboardingStyle }> = [
  { label: "Chill", value: "chill" },
  { label: "Spontaneous", value: "spontaneous" },
  { label: "Planned", value: "planned" },
  { label: "Focused", value: "focused" },
];

function resolveTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function mapFormatToSocialMode(format: OnboardingFormat): SocialMode {
  if (format === "one_to_one") {
    return "one_to_one";
  }
  if (format === "small_groups") {
    return "group";
  }
  return "either";
}

function StepDots({ activeIndex }: { activeIndex: number }) {
  return (
    <View className="flex-row items-center gap-2">
      {steps.map((step, index) => (
        <View
          className={
            index === activeIndex
              ? "h-2 w-5 rounded-full bg-white"
              : "h-2 w-2 rounded-full bg-white/20"
          }
          key={step}
        />
      ))}
    </View>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <Text className="mb-3 text-[11px] font-medium uppercase tracking-[0.18em] text-muted">
      {children}
    </Text>
  );
}

export function OnboardingScreen({
  defaultName,
  errorMessage,
  loading,
  onComplete,
}: OnboardingScreenProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [goals, setGoals] = useState<string[]>([]);
  const [interests, setInterests] = useState<string[]>([]);
  const [interestQuery, setInterestQuery] = useState("");
  const [customInterest, setCustomInterest] = useState("");
  const [availability, setAvailability] =
    useState<OnboardingAvailability>("flexible");
  const [format, setFormat] = useState<OnboardingFormat>("both");
  const [mode, setMode] = useState<OnboardingMode>("both");
  const [style, setStyle] = useState<OnboardingStyle>("chill");
  const [name, setName] = useState(defaultName);
  const [bio, setBio] = useState("");
  const [location, setLocation] = useState("");
  const [firstIntentText, setFirstIntentText] = useState("");

  const activeStep = steps[stepIndex];
  const filteredInterests = useMemo(() => {
    const normalizedQuery = interestQuery.trim().toLowerCase();
    if (!normalizedQuery) {
      return interestOptions;
    }
    return interestOptions.filter((option) =>
      option.toLowerCase().includes(normalizedQuery),
    );
  }, [interestQuery]);

  const validationMessage = useMemo(() => {
    if (activeStep === "goals" && goals.length === 0) {
      return "Pick at least one starting direction.";
    }
    if (activeStep === "interests" && interests.length === 0) {
      return "Choose at least one topic so matching has a signal.";
    }
    if (activeStep === "profile" && name.trim().length === 0) {
      return "Add the name people should see.";
    }
    return null;
  }, [activeStep, goals.length, interests.length, name]);

  const canContinue = validationMessage === null;

  const toggleMultiSelect = (
    value: string,
    setter: Dispatch<SetStateAction<string[]>>,
  ) => {
    setter((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    );
  };

  const addCustomInterest = () => {
    const label = customInterest.trim();
    if (!label) {
      return;
    }
    setInterests((current) =>
      current.some((item) => item.toLowerCase() === label.toLowerCase())
        ? current
        : [...current, label],
    );
    setCustomInterest("");
  };

  const handleBack = () => {
    setStepIndex((current) => Math.max(0, current - 1));
  };

  const handleContinue = async () => {
    if (activeStep !== "intent") {
      if (!canContinue) {
        return;
      }
      setStepIndex((current) => Math.min(steps.length - 1, current + 1));
      return;
    }

    await onComplete({
      displayName: name.trim(),
      bio: bio.trim(),
      city: location.trim(),
      country: "",
      interests,
      socialMode: mapFormatToSocialMode(format),
      notificationMode: "live",
      onboardingGoals: goals,
      preferredAvailability: availability,
      preferredFormat: format,
      preferredMode: mode,
      preferredStyle: style,
      firstIntentText: firstIntentText.trim() || null,
      timezone: resolveTimezone(),
    });
  };

  const handleSkipIntent = async () => {
    await onComplete({
      displayName: name.trim(),
      bio: bio.trim(),
      city: location.trim(),
      country: "",
      interests,
      socialMode: mapFormatToSocialMode(format),
      notificationMode: "live",
      onboardingGoals: goals,
      preferredAvailability: availability,
      preferredFormat: format,
      preferredMode: mode,
      preferredStyle: style,
      firstIntentText: null,
      timezone: resolveTimezone(),
    });
  };

  const title =
    activeStep === "welcome"
      ? "Start with intent."
      : activeStep === "goals"
        ? "What brings you here?"
        : activeStep === "interests"
          ? "What are you into?"
          : activeStep === "preferences"
            ? "How do you like to connect?"
            : activeStep === "profile"
              ? "Set up your profile"
              : "What do you want right now?";

  const subtitle =
    activeStep === "welcome"
      ? "Tell OpenSocial what you want to do or explore."
      : activeStep === "goals"
        ? "Pick what you want to start with."
        : activeStep === "interests"
          ? "Choose a few topics."
          : activeStep === "preferences"
            ? "Set a few defaults."
            : activeStep === "profile"
              ? "Just enough so people know who they’re saying yes to."
              : "Start with anything.";

  return (
    <SafeAreaView className="flex-1 bg-canvas" testID="onboarding-screen">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <AnimatedScreen screenKey={activeStep}>
          <View className="flex-1 px-6 pt-4">
            <View className="mb-6 gap-3">
              <Text className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
                {activeStep === "welcome"
                  ? "OpenSocial"
                  : `Step ${stepIndex + 1} of ${steps.length}`}
              </Text>
              <Text className="text-[32px] font-semibold leading-[36px] tracking-tight text-ink">
                {title}
              </Text>
              <Text className="text-[15px] leading-[22px] text-muted">
                {subtitle}
              </Text>
              {activeStep !== "welcome" ? (
                <StepDots activeIndex={stepIndex} />
              ) : null}
            </View>

            {errorMessage ? (
              <InlineNotice text={errorMessage} tone="error" />
            ) : null}
            {validationMessage && activeStep !== "intent" ? (
              <View className="mt-3">
                <InlineNotice text={validationMessage} tone="info" />
              </View>
            ) : null}

            <ScrollView
              className="mt-4 flex-1"
              contentContainerStyle={{ paddingBottom: 24, gap: 18 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {activeStep === "welcome" ? (
                <View className="flex-1 justify-center pt-10">
                  <View className="rounded-[28px] border border-white/8 bg-surface px-5 py-6">
                    <Text className="text-[18px] font-semibold tracking-tight text-ink">
                      Meet the right people faster.
                    </Text>
                    <Text className="mt-3 text-[15px] leading-[24px] text-muted">
                      We’ll use a few signals to understand who you want to
                      meet, what you want to do, and how to move you into a real
                      conversation.
                    </Text>
                  </View>
                </View>
              ) : null}

              {activeStep === "goals" ? (
                <View>
                  <View className="flex-row flex-wrap gap-3">
                    {goalOptions.map((goal) => (
                      <ChoiceChip
                        key={goal}
                        label={goal}
                        onPress={() => toggleMultiSelect(goal, setGoals)}
                        selected={goals.includes(goal)}
                      />
                    ))}
                  </View>
                </View>
              ) : null}

              {activeStep === "interests" ? (
                <View>
                  <TextInput
                    className="rounded-2xl border border-hairline bg-surface px-4 py-3 text-[15px] text-ink"
                    onChangeText={setInterestQuery}
                    placeholder="Search topics"
                    placeholderTextColor="#8e8e8e"
                    value={interestQuery}
                  />
                  <View className="mt-4 flex-row flex-wrap gap-3">
                    {filteredInterests.map((interest) => (
                      <ChoiceChip
                        key={interest}
                        label={interest}
                        onPress={() =>
                          toggleMultiSelect(interest, setInterests)
                        }
                        selected={interests.includes(interest)}
                      />
                    ))}
                  </View>
                  <View className="mt-6 gap-3">
                    <SectionLabel>Custom topic</SectionLabel>
                    <View className="flex-row gap-3">
                      <TextInput
                        className="flex-1 rounded-2xl border border-hairline bg-surface px-4 py-3 text-[15px] text-ink"
                        onChangeText={setCustomInterest}
                        onSubmitEditing={addCustomInterest}
                        placeholder="Add your own"
                        placeholderTextColor="#8e8e8e"
                        returnKeyType="done"
                        value={customInterest}
                      />
                      <Pressable
                        className="min-w-[76px] items-center justify-center rounded-2xl border border-white/10 bg-surface px-4"
                        onPress={addCustomInterest}
                      >
                        <Text className="text-[14px] font-medium text-ink">
                          Add
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              ) : null}

              {activeStep === "preferences" ? (
                <View className="gap-6">
                  <View>
                    <SectionLabel>Availability</SectionLabel>
                    <View className="flex-row flex-wrap gap-3">
                      {availabilityOptions.map((option) => (
                        <ChoiceChip
                          key={option.value}
                          label={option.label}
                          onPress={() => setAvailability(option.value)}
                          selected={availability === option.value}
                        />
                      ))}
                    </View>
                  </View>
                  <View>
                    <SectionLabel>Format</SectionLabel>
                    <View className="flex-row flex-wrap gap-3">
                      {formatOptions.map((option) => (
                        <ChoiceChip
                          key={option.value}
                          label={option.label}
                          onPress={() => setFormat(option.value)}
                          selected={format === option.value}
                        />
                      ))}
                    </View>
                  </View>
                  <View>
                    <SectionLabel>Mode</SectionLabel>
                    <View className="flex-row flex-wrap gap-3">
                      {modeOptions.map((option) => (
                        <ChoiceChip
                          key={option.value}
                          label={option.label}
                          onPress={() => setMode(option.value)}
                          selected={mode === option.value}
                        />
                      ))}
                    </View>
                  </View>
                  <View>
                    <SectionLabel>Style</SectionLabel>
                    <View className="flex-row flex-wrap gap-3">
                      {styleOptions.map((option) => (
                        <ChoiceChip
                          key={option.value}
                          label={option.label}
                          onPress={() => setStyle(option.value)}
                          selected={style === option.value}
                        />
                      ))}
                    </View>
                  </View>
                </View>
              ) : null}

              {activeStep === "profile" ? (
                <View className="gap-5">
                  <View className="rounded-[24px] border border-white/8 bg-surface px-4 py-4">
                    <Text className="text-[14px] leading-[21px] text-muted">
                      Your Google sign-in already gives us a starting identity.
                      You can refine it here and add a photo later from Profile.
                    </Text>
                  </View>
                  <View>
                    <SectionLabel>Name</SectionLabel>
                    <TextInput
                      className="rounded-2xl border border-hairline bg-surface px-4 py-3 text-[15px] text-ink"
                      onChangeText={setName}
                      placeholder="Your name"
                      placeholderTextColor="#8e8e8e"
                      value={name}
                    />
                  </View>
                  <View>
                    <SectionLabel>Short bio</SectionLabel>
                    <TextInput
                      className="min-h-[110px] rounded-2xl border border-hairline bg-surface px-4 py-3 text-[15px] leading-[22px] text-ink"
                      multiline
                      onChangeText={setBio}
                      placeholder="A line or two if you want"
                      placeholderTextColor="#8e8e8e"
                      textAlignVertical="top"
                      value={bio}
                    />
                  </View>
                  <View>
                    <SectionLabel>Location</SectionLabel>
                    <TextInput
                      className="rounded-2xl border border-hairline bg-surface px-4 py-3 text-[15px] text-ink"
                      onChangeText={setLocation}
                      placeholder="City or area"
                      placeholderTextColor="#8e8e8e"
                      value={location}
                    />
                  </View>
                </View>
              ) : null}

              {activeStep === "intent" ? (
                <View className="gap-5">
                  <TextInput
                    className="min-h-[210px] rounded-[28px] border border-hairline bg-surface px-5 py-5 text-[17px] leading-[25px] text-ink"
                    multiline
                    onChangeText={setFirstIntentText}
                    placeholder={[
                      "I want to play Apex tonight",
                      "Talk about the match",
                      "Meet people into design",
                      "Find someone to run with",
                      "Talk to founders",
                    ].join("\n")}
                    placeholderTextColor="#8e8e8e"
                    textAlignVertical="top"
                    value={firstIntentText}
                  />
                  <Text className="text-[14px] leading-[21px] text-muted">
                    We’ll turn this into your first live interaction right away.
                  </Text>
                </View>
              ) : null}
            </ScrollView>
          </View>
        </AnimatedScreen>

        <View className="border-t border-white/6 px-6 pb-4 pt-4">
          <View className="flex-row items-center gap-3">
            {stepIndex > 0 ? (
              <Pressable
                className="h-12 items-center justify-center rounded-2xl border border-white/10 px-4"
                onPress={handleBack}
              >
                <Text className="text-[14px] font-medium text-muted">Back</Text>
              </Pressable>
            ) : null}
            <View className="flex-1">
              <PrimaryButton
                disabled={activeStep !== "intent" && !canContinue}
                label={
                  activeStep === "intent"
                    ? "Try it"
                    : activeStep === "welcome"
                      ? "Continue"
                      : "Continue"
                }
                loading={loading}
                onPress={handleContinue}
                testID="onboarding-continue-button"
              />
            </View>
          </View>
          {activeStep === "intent" ? (
            <View className="mt-3">
              <PrimaryButton
                label="Skip"
                loading={false}
                onPress={handleSkipIntent}
                variant="ghost"
              />
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
