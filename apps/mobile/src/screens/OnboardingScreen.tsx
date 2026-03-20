import { useMemo, useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ChoiceChip } from "../components/ChoiceChip";
import { InlineNotice } from "../components/InlineNotice";
import { PrimaryButton } from "../components/PrimaryButton";
import { SurfaceCard } from "../components/SurfaceCard";
import { SocialMode, UserProfileDraft } from "../types";

interface OnboardingScreenProps {
  defaultName: string;
  onComplete: (profile: UserProfileDraft) => Promise<void>;
  loading: boolean;
  errorMessage: string | null;
}

const interestOptions = [
  "Football",
  "Gaming",
  "Tennis",
  "Startups",
  "Design",
  "AI",
];

export function OnboardingScreen({
  defaultName,
  errorMessage,
  loading,
  onComplete,
}: OnboardingScreenProps) {
  const [bio, setBio] = useState("I like fast plans and good conversations.");
  const [city, setCity] = useState("Buenos Aires");
  const [country, setCountry] = useState("Argentina");
  const [selectedInterests, setSelectedInterests] = useState<string[]>([
    "Football",
    "AI",
  ]);
  const [socialMode, setSocialMode] = useState<SocialMode>("one_to_one");
  const [notificationMode, setNotificationMode] = useState<"live" | "digest">(
    "live",
  );

  const canContinue =
    selectedInterests.length > 0 &&
    bio.trim().length > 0 &&
    city.trim().length > 0 &&
    country.trim().length > 0;

  const profilePreview = useMemo(
    () =>
      `${defaultName} prefers ${
        socialMode === "one_to_one"
          ? "1:1"
          : socialMode === "group"
            ? "groups"
            : "mixed mode"
      } and ${notificationMode === "live" ? "live alerts" : "digest updates"}.`,
    [defaultName, notificationMode, socialMode],
  );

  const toggleInterest = (label: string) => {
    setSelectedInterests((current) =>
      current.includes(label)
        ? current.filter((item) => item !== label)
        : [...current, label],
    );
  };

  const handleComplete = async () => {
    if (!canContinue) {
      return;
    }

    await onComplete({
      displayName: defaultName,
      bio: bio.trim(),
      city: city.trim(),
      country: country.trim(),
      interests: selectedInterests,
      socialMode,
      notificationMode,
    });
  };

  return (
    <SafeAreaView className="flex-1 bg-canvas" testID="onboarding-screen">
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingTop: 18,
          paddingBottom: 40,
          gap: 14,
        }}
      >
        <Text className="text-[11px] font-semibold uppercase tracking-widest text-muted">
          Onboarding
        </Text>
        <Text className="text-[28px] font-semibold tracking-tight text-ink">
          Finish your profile
        </Text>
        <Text className="text-[15px] leading-[23px] text-muted">
          A few details help us suggest better people and plans. You can change
          everything later in Profile.
        </Text>

        {errorMessage ? (
          <InlineNotice text={errorMessage} tone="error" />
        ) : null}

        <SurfaceCard>
          <Text className="mb-3 text-[17px] font-semibold tracking-tight text-ink">
            Profile essentials
          </Text>
          <Text className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted">
            Bio
          </Text>
          <TextInput
            className="mb-3 min-h-[88px] rounded-xl border border-hairline bg-surfaceMuted/50 px-4 py-3 text-[15px] leading-[22px] text-ink"
            multiline
            onChangeText={setBio}
            placeholder="Short intro"
            placeholderTextColor="#8e8e8e"
            testID="onboarding-bio-input"
            textAlignVertical="top"
            value={bio}
          />
          <View className="flex-row gap-2">
            <TextInput
              className="flex-1 rounded-xl border border-hairline bg-surfaceMuted/50 px-4 py-3 text-[15px] text-ink"
              onChangeText={setCity}
              placeholder="City"
              placeholderTextColor="#8e8e8e"
              testID="onboarding-city-input"
              value={city}
            />
            <TextInput
              className="flex-1 rounded-xl border border-hairline bg-surfaceMuted/50 px-4 py-3 text-[15px] text-ink"
              onChangeText={setCountry}
              placeholder="Country"
              placeholderTextColor="#8e8e8e"
              testID="onboarding-country-input"
              value={country}
            />
          </View>
        </SurfaceCard>

        <SurfaceCard>
          <Text className="mb-3 text-[17px] font-semibold tracking-tight text-ink">
            Interests
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {interestOptions.map((interest) => (
              <ChoiceChip
                key={interest}
                label={interest}
                onPress={() => toggleInterest(interest)}
                selected={selectedInterests.includes(interest)}
              />
            ))}
          </View>
        </SurfaceCard>

        <SurfaceCard>
          <Text className="mb-3 text-[17px] font-semibold tracking-tight text-ink">
            Connection style
          </Text>
          <View className="flex-row flex-wrap gap-2">
            <ChoiceChip
              label="1:1"
              onPress={() => setSocialMode("one_to_one")}
              selected={socialMode === "one_to_one"}
            />
            <ChoiceChip
              label="Group"
              onPress={() => setSocialMode("group")}
              selected={socialMode === "group"}
            />
            <ChoiceChip
              label="Flexible"
              onPress={() => setSocialMode("either")}
              selected={socialMode === "either"}
            />
          </View>
        </SurfaceCard>

        <SurfaceCard>
          <Text className="mb-3 text-[17px] font-semibold tracking-tight text-ink">
            Notification mode
          </Text>
          <View className="flex-row flex-wrap gap-2">
            <ChoiceChip
              label="Live"
              onPress={() => setNotificationMode("live")}
              selected={notificationMode === "live"}
            />
            <ChoiceChip
              label="Digest"
              onPress={() => setNotificationMode("digest")}
              selected={notificationMode === "digest"}
            />
          </View>
          <Text className="mt-3 text-[13px] leading-5 text-muted">
            {profilePreview}
          </Text>
        </SurfaceCard>

        <PrimaryButton
          disabled={!canContinue}
          label="Continue"
          loading={loading}
          onPress={handleComplete}
          testID="onboarding-continue-button"
        />
      </ScrollView>
    </SafeAreaView>
  );
}
