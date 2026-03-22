import { LinearGradient } from "expo-linear-gradient";
import {
  type Dispatch,
  type SetStateAction,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Image,
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
import { pickProfilePhoto } from "../lib/profile-photo-upload";
import {
  loadOnboardingDraft,
  saveOnboardingDraft,
} from "../onboarding-storage";
import {
  type OnboardingAvailability,
  type OnboardingFormat,
  type OnboardingMode,
  type OnboardingStyle,
  type ProfilePhotoDraft,
  type SocialMode,
  type UserProfileDraft,
} from "../types";

interface OnboardingScreenProps {
  userId: string;
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
              ? "h-2 w-6 rounded-full bg-white"
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

function AmbientBackdrop() {
  return (
    <View className="absolute inset-0 overflow-hidden">
      <LinearGradient
        colors={["rgba(151,206,255,0.14)", "rgba(151,206,255,0)"]}
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={{
          position: "absolute",
          top: -120,
          right: -50,
          width: 280,
          height: 280,
          borderRadius: 280,
        }}
      />
      <LinearGradient
        colors={["rgba(118,255,195,0.09)", "rgba(118,255,195,0)"]}
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={{
          position: "absolute",
          bottom: -160,
          left: -80,
          width: 320,
          height: 320,
          borderRadius: 320,
        }}
      />
    </View>
  );
}

export function OnboardingScreen({
  userId,
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
  const [profilePhoto, setProfilePhoto] = useState<ProfilePhotoDraft | null>(
    null,
  );
  const [photoBusy, setPhotoBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const activeStep = steps[stepIndex];

  useEffect(() => {
    let mounted = true;
    void loadOnboardingDraft(userId)
      .then((draft) => {
        if (!mounted || !draft) {
          return;
        }
        setStepIndex(draft.stepIndex);
        setGoals(draft.goals);
        setInterests(draft.interests);
        setAvailability(draft.availability);
        setFormat(draft.format);
        setMode(draft.mode);
        setStyle(draft.style);
        setName(draft.name || defaultName);
        setBio(draft.bio);
        setLocation(draft.location);
        setFirstIntentText(draft.firstIntentText);
        setProfilePhoto(draft.profilePhoto);
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) {
          setHydrated(true);
        }
      });

    return () => {
      mounted = false;
    };
  }, [defaultName, userId]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    void saveOnboardingDraft(userId, {
      stepIndex,
      goals,
      interests,
      availability,
      format,
      mode,
      style,
      name,
      bio,
      location,
      firstIntentText,
      profilePhoto,
    }).catch(() => {});
  }, [
    availability,
    bio,
    firstIntentText,
    format,
    goals,
    hydrated,
    interests,
    location,
    mode,
    name,
    profilePhoto,
    stepIndex,
    style,
    userId,
  ]);

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

  const buildDraft = (intentText: string | null): UserProfileDraft => ({
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
    firstIntentText: intentText,
    timezone: resolveTimezone(),
    profilePhoto,
  });

  const handleContinue = async () => {
    setLocalError(null);
    if (activeStep !== "intent") {
      if (!canContinue) {
        return;
      }
      setStepIndex((current) => Math.min(steps.length - 1, current + 1));
      return;
    }

    await onComplete(buildDraft(firstIntentText.trim() || null));
  };

  const handleSkipIntent = async () => {
    setLocalError(null);
    await onComplete(buildDraft(null));
  };

  const handlePickProfilePhoto = async () => {
    setPhotoBusy(true);
    setLocalError(null);
    try {
      const nextPhoto = await pickProfilePhoto();
      if (nextPhoto) {
        setProfilePhoto(nextPhoto);
      }
    } catch (error) {
      setLocalError(String(error));
    } finally {
      setPhotoBusy(false);
    }
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
      <AmbientBackdrop />
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
            {localError ? (
              <InlineNotice text={localError} tone="error" />
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
                <LinearGradient
                  colors={["rgba(255,255,255,0.12)", "rgba(255,255,255,0.04)"]}
                  end={{ x: 1, y: 1 }}
                  start={{ x: 0, y: 0 }}
                  style={{ borderRadius: 28, padding: 1 }}
                >
                  <View className="rounded-[27px] bg-surface px-5 py-6">
                    <Text className="text-[20px] font-semibold tracking-tight text-ink">
                      Meet the right people faster.
                    </Text>
                    <Text className="mt-3 text-[15px] leading-[24px] text-muted">
                      We’ll collect only the signals that help us understand who
                      you want to meet, what you want to do, and how to move you
                      into a real conversation.
                    </Text>
                  </View>
                </LinearGradient>
              ) : null}

              {activeStep === "goals" ? (
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
              ) : null}

              {activeStep === "interests" ? (
                <View>
                  <TextInput
                    className="rounded-2xl border border-hairline bg-surface/90 px-4 py-3 text-[15px] text-ink"
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
                        className="flex-1 rounded-2xl border border-hairline bg-surface/90 px-4 py-3 text-[15px] text-ink"
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
                  <LinearGradient
                    colors={["rgba(151,206,255,0.2)", "rgba(255,255,255,0.05)"]}
                    end={{ x: 1, y: 1 }}
                    start={{ x: 0, y: 0 }}
                    style={{ borderRadius: 28, padding: 1 }}
                  >
                    <View className="rounded-[27px] bg-surface px-4 py-4">
                      <Text className="text-[14px] leading-[21px] text-muted">
                        Google already got you through the door. Add a name,
                        optional photo, and a small bit of context so the first
                        reply feels personal.
                      </Text>
                    </View>
                  </LinearGradient>
                  <View>
                    <SectionLabel>Profile photo</SectionLabel>
                    <Pressable
                      className="rounded-[28px] border border-white/10 bg-surface px-5 py-5"
                      onPress={handlePickProfilePhoto}
                    >
                      <View className="flex-row items-center gap-4">
                        {profilePhoto ? (
                          <Image
                            source={{ uri: profilePhoto.uri }}
                            style={{ width: 72, height: 72, borderRadius: 24 }}
                          />
                        ) : (
                          <LinearGradient
                            colors={[
                              "rgba(151,206,255,0.32)",
                              "rgba(118,255,195,0.18)",
                            ]}
                            end={{ x: 1, y: 1 }}
                            start={{ x: 0, y: 0 }}
                            style={{
                              width: 72,
                              height: 72,
                              borderRadius: 24,
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <Text className="text-[22px] font-semibold text-ink">
                              +
                            </Text>
                          </LinearGradient>
                        )}
                        <View className="flex-1">
                          <Text className="text-[16px] font-semibold text-ink">
                            {profilePhoto
                              ? "Photo selected"
                              : "Add a profile photo"}
                          </Text>
                          <Text className="mt-1 text-[14px] leading-[20px] text-muted">
                            {profilePhoto
                              ? "We’ll upload it when you finish onboarding."
                              : "Optional, but it makes replies feel more human."}
                          </Text>
                        </View>
                      </View>
                    </Pressable>
                    {photoBusy ? (
                      <Text className="mt-2 text-[13px] text-muted">
                        Opening library…
                      </Text>
                    ) : null}
                  </View>
                  <View>
                    <SectionLabel>Name</SectionLabel>
                    <TextInput
                      className="rounded-2xl border border-hairline bg-surface/90 px-4 py-3 text-[15px] text-ink"
                      onChangeText={setName}
                      placeholder="Your name"
                      placeholderTextColor="#8e8e8e"
                      value={name}
                    />
                  </View>
                  <View>
                    <SectionLabel>Short bio</SectionLabel>
                    <TextInput
                      className="min-h-[110px] rounded-2xl border border-hairline bg-surface/90 px-4 py-3 text-[15px] leading-[22px] text-ink"
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
                      className="rounded-2xl border border-hairline bg-surface/90 px-4 py-3 text-[15px] text-ink"
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
                  <LinearGradient
                    colors={[
                      "rgba(255,255,255,0.12)",
                      "rgba(255,255,255,0.04)",
                    ]}
                    end={{ x: 1, y: 1 }}
                    start={{ x: 0, y: 0 }}
                    style={{ borderRadius: 32, padding: 1 }}
                  >
                    <TextInput
                      className="min-h-[220px] rounded-[31px] bg-surface px-5 py-5 text-[17px] leading-[25px] text-ink"
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
                  </LinearGradient>
                  <Text className="text-[14px] leading-[21px] text-muted">
                    We’ll open your main agent thread and use this as the first
                    thing it acts on.
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
                label={activeStep === "intent" ? "Try it" : "Continue"}
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
