import Ionicons from "@expo/vector-icons/Ionicons";
import * as ImagePicker from "expo-image-picker";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, { FadeInUp } from "react-native-reanimated";

import { hapticImpact, hapticSelection } from "../lib/haptics";
import type { UserProfileDraft } from "../types";
import { PrimaryButton } from "../components/PrimaryButton";
import { useSelfProfileData } from "./profile/useProfileData";

type ProfileScreenProps = {
  accessToken: string;
  displayName: string;
  email?: string | null;
  initialDraft: UserProfileDraft;
  userId: string;
  onProfileUpdated: (profile: UserProfileDraft) => void;
  onResetSession: () => Promise<void>;
};

const PROFILE_SPACING = {
  outerX: 20,
  sectionGap: 20,
  titleToContent: 12,
};

function Chip({ label }: { label: string }) {
  return (
    <View className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5">
      <Text className="text-[12px] font-medium text-white/82">{label}</Text>
    </View>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ marginTop: PROFILE_SPACING.sectionGap }}>
      <Text className="text-[16px] font-semibold tracking-[-0.01em] text-white/94">
        {title}
      </Text>
      {subtitle ? (
        <Text className="mt-1 text-[13px] leading-[19px] text-white/48">
          {subtitle}
        </Text>
      ) : null}
      <View style={{ marginTop: PROFILE_SPACING.titleToContent }}>
        {children}
      </View>
      <View className="mt-5 h-px bg-white/[0.05]" />
    </View>
  );
}

function ActionRow({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      className="flex-row items-center justify-between py-3"
      onPress={onPress}
    >
      <View className="flex-row items-center gap-3">
        <Ionicons color="rgba(255,255,255,0.74)" name={icon} size={16} />
        <Text className="text-[14px] text-white/86">{label}</Text>
      </View>
      <Ionicons
        color="rgba(255,255,255,0.34)"
        name="chevron-forward"
        size={15}
      />
    </Pressable>
  );
}

export function ProfileScreen({
  accessToken,
  displayName,
  email,
  initialDraft,
  onProfileUpdated,
  onResetSession,
  userId,
}: ProfileScreenProps) {
  const {
    error,
    loading,
    profile,
    refreshUnderstanding,
    save,
    saving,
    updateAvatar,
  } = useSelfProfileData({
    accessToken,
    displayName,
    email,
    initialDraft,
    userId,
  });
  const [editingBio, setEditingBio] = useState(false);
  const [editingInterests, setEditingInterests] = useState(false);
  const [editingPreferences, setEditingPreferences] = useState(false);
  const [bioDraft, setBioDraft] = useState("");
  const [locationDraft, setLocationDraft] = useState("");
  const [interestsDraft, setInterestsDraft] = useState("");
  const [modeDraft, setModeDraft] = useState(initialDraft.socialMode);
  const [availabilityDraft, setAvailabilityDraft] = useState(
    profile.preferences.availability ?? "Evenings and weekends",
  );

  const initial = useMemo(
    () => (profile.name.trim().charAt(0) || "U").toUpperCase(),
    [profile.name],
  );

  const beginBioEdit = () => {
    setBioDraft(profile.bio ?? "");
    setLocationDraft(profile.location ?? "");
    setEditingBio(true);
  };

  const pickAndUploadAvatar = async (source: "camera" | "library") => {
    const permission =
      source === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Permission needed",
        source === "camera"
          ? "Allow camera access to update your profile photo."
          : "Allow photo access to update your profile photo.",
      );
      return;
    }

    const result =
      source === "camera"
        ? await ImagePicker.launchCameraAsync({
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.85,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.85,
          });

    if (result.canceled || !result.assets[0]) return;
    await updateAvatar({
      uri: result.assets[0].uri,
      mimeType: result.assets[0].mimeType ?? null,
      fileSize:
        typeof result.assets[0].fileSize === "number"
          ? result.assets[0].fileSize
          : null,
    });
    hapticSelection();
  };

  const openAvatarActions = () => {
    Alert.alert("Profile photo", "Choose how to update your photo.", [
      {
        text: "Take photo",
        onPress: () => {
          void pickAndUploadAvatar("camera");
        },
      },
      {
        text: "Choose from library",
        onPress: () => {
          void pickAndUploadAvatar("library");
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const beginInterestsEdit = () => {
    setInterestsDraft(profile.interests.join(", "));
    setEditingInterests(true);
  };

  const beginPreferencesEdit = () => {
    setModeDraft(initialDraft.socialMode);
    setAvailabilityDraft(profile.preferences.availability ?? "");
    setEditingPreferences(true);
  };

  const saveBio = async () => {
    const [city, country] = locationDraft.split(",").map((item) => item.trim());
    await save({
      bio: bioDraft.trim(),
      city: city || "",
      country: country || "",
    });
    setEditingBio(false);
    onProfileUpdated({
      ...initialDraft,
      bio: bioDraft.trim(),
      city: city || "",
      country: country || "",
    });
    hapticSelection();
  };

  const saveInterests = async () => {
    const interests = interestsDraft
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
    await save({ interests });
    setEditingInterests(false);
    onProfileUpdated({
      ...initialDraft,
      interests,
    });
    hapticSelection();
  };

  const savePreferences = async () => {
    await save({
      socialMode: modeDraft,
      preferOneToOne: modeDraft === "one_to_one",
      allowGroupInvites: modeDraft !== "one_to_one",
    });
    setEditingPreferences(false);
    onProfileUpdated({
      ...initialDraft,
      socialMode: modeDraft,
    });
    hapticSelection();
  };

  return (
    <View className="flex-1 bg-[#050506] pt-2">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingBottom: 180,
          paddingHorizontal: PROFILE_SPACING.outerX,
        }}
      >
        <View className="flex-row items-center justify-between pt-1.5">
          <Text className="text-[13px] font-semibold uppercase tracking-[0.12em] text-white/50">
            Profile
          </Text>
          <Pressable
            className="h-8 w-8 items-center justify-center"
            onPress={() => {
              hapticSelection();
              void refreshUnderstanding();
            }}
          >
            <Ionicons
              color="rgba(255,255,255,0.75)"
              name="settings-outline"
              size={16}
            />
          </Pressable>
        </View>

        <Animated.View
          entering={FadeInUp.duration(260)}
          style={{ marginTop: 18 }}
        >
          <Pressable
            className="h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-white/[0.08]"
            onPress={openAvatarActions}
          >
            {profile.avatarUrl ? (
              <Image
                source={{ uri: profile.avatarUrl }}
                className="h-full w-full"
                resizeMode="cover"
              />
            ) : (
              <Text className="text-[30px] font-semibold text-white">
                {initial}
              </Text>
            )}
          </Pressable>
          <Text className="mt-4 text-[31px] font-semibold leading-[35px] tracking-[-0.03em] text-white">
            {profile.name}
          </Text>
          <Text className="mt-2 max-w-[330px] text-[15px] leading-[23px] text-white/58">
            {profile.bio ||
              "Add a short summary so people understand your style."}
          </Text>
          <Text className="mt-2 text-[13px] text-white/46">
            {profile.location || "Location optional"}
          </Text>
          <View className="mt-4 flex-row gap-2">
            <View className="flex-1">
              <PrimaryButton
                label="Edit profile"
                onPress={beginBioEdit}
                variant="secondary"
              />
            </View>
            <View className="flex-1">
              <PrimaryButton
                label="Preferences"
                onPress={beginPreferencesEdit}
                variant="ghost"
              />
            </View>
          </View>
          {loading ? (
            <View className="mt-3 flex-row items-center gap-2">
              <ActivityIndicator color="rgba(255,255,255,0.65)" size="small" />
              <Text className="text-[12px] text-white/46">
                Loading profile details...
              </Text>
            </View>
          ) : null}
          {error ? (
            <Text className="mt-3 text-[12px] text-[#fca5a5]">{error}</Text>
          ) : null}
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(40).duration(260)}>
          <Section title="About">
            {editingBio ? (
              <View className="gap-2">
                <TextInput
                  className="rounded-[16px] border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-[14px] text-white"
                  multiline
                  onChangeText={setBioDraft}
                  placeholder="Add a short bio"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  value={bioDraft}
                />
                <TextInput
                  className="rounded-[16px] border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-[14px] text-white"
                  onChangeText={setLocationDraft}
                  placeholder="City, Country"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  value={locationDraft}
                />
                <View className="flex-row gap-2">
                  <View className="flex-1">
                    <PrimaryButton
                      disabled={saving}
                      label="Cancel"
                      onPress={() => setEditingBio(false)}
                      variant="ghost"
                    />
                  </View>
                  <View className="flex-1">
                    <PrimaryButton
                      disabled={saving}
                      label={saving ? "Saving..." : "Save"}
                      onPress={() => {
                        void saveBio();
                      }}
                    />
                  </View>
                </View>
              </View>
            ) : (
              <>
                <Text className="text-[14px] leading-[22px] text-white/78">
                  {profile.bio || "Add a short line so people know your vibe."}
                </Text>
                <Text className="mt-2 text-[12px] text-white/48">
                  {profile.location || "Location is optional"}
                </Text>
                <Pressable
                  className="mt-3 flex-row items-center gap-2"
                  onPress={beginBioEdit}
                >
                  <Ionicons
                    color="rgba(255,255,255,0.78)"
                    name="create-outline"
                    size={14}
                  />
                  <Text className="text-[13px] font-medium text-white/80">
                    Edit profile
                  </Text>
                </Pressable>
              </>
            )}
          </Section>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(80).duration(260)}>
          <Section title="Interests">
            {editingInterests ? (
              <View className="gap-2">
                <TextInput
                  className="rounded-[16px] border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-[14px] text-white"
                  onChangeText={setInterestsDraft}
                  placeholder="Design, Football, Startups"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  value={interestsDraft}
                />
                <View className="flex-row gap-2">
                  <View className="flex-1">
                    <PrimaryButton
                      disabled={saving}
                      label="Cancel"
                      onPress={() => setEditingInterests(false)}
                      variant="ghost"
                    />
                  </View>
                  <View className="flex-1">
                    <PrimaryButton
                      disabled={saving}
                      label={saving ? "Saving..." : "Save"}
                      onPress={() => {
                        void saveInterests();
                      }}
                    />
                  </View>
                </View>
              </View>
            ) : (
              <>
                <View className="flex-row flex-wrap gap-2">
                  {profile.interests.length > 0 ? (
                    profile.interests.map((interest) => (
                      <Chip key={interest} label={interest} />
                    ))
                  ) : (
                    <Text className="text-[13px] text-white/44">
                      Add interests to improve matching quality.
                    </Text>
                  )}
                </View>
                <Pressable
                  className="mt-3 flex-row items-center gap-2"
                  onPress={beginInterestsEdit}
                >
                  <Ionicons
                    color="rgba(255,255,255,0.78)"
                    name="add-circle-outline"
                    size={14}
                  />
                  <Text className="text-[13px] font-medium text-white/80">
                    Update interests
                  </Text>
                </Pressable>
              </>
            )}
          </Section>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(120).duration(260)}>
          <Section title="How You Connect">
            {editingPreferences ? (
              <View className="gap-2">
                <View className="flex-row flex-wrap gap-2">
                  {[
                    { key: "one_to_one", label: "1:1" },
                    { key: "group", label: "Groups" },
                    { key: "either", label: "Both" },
                  ].map((option) => (
                    <Pressable
                      className={`rounded-full border px-3 py-1.5 ${
                        modeDraft === option.key
                          ? "border-white bg-white"
                          : "border-white/[0.1] bg-white/[0.04]"
                      }`}
                      key={option.key}
                      onPress={() => {
                        setModeDraft(
                          option.key as UserProfileDraft["socialMode"],
                        );
                      }}
                    >
                      <Text
                        className={`text-[12px] font-semibold ${
                          modeDraft === option.key
                            ? "text-black"
                            : "text-white/82"
                        }`}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <TextInput
                  className="rounded-[16px] border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-[14px] text-white"
                  onChangeText={setAvailabilityDraft}
                  placeholder="Availability"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  value={availabilityDraft}
                />
                <View className="flex-row gap-2">
                  <View className="flex-1">
                    <PrimaryButton
                      disabled={saving}
                      label="Cancel"
                      onPress={() => setEditingPreferences(false)}
                      variant="ghost"
                    />
                  </View>
                  <View className="flex-1">
                    <PrimaryButton
                      disabled={saving}
                      label={saving ? "Saving..." : "Save"}
                      onPress={() => {
                        void savePreferences();
                      }}
                    />
                  </View>
                </View>
              </View>
            ) : (
              <View className="gap-2.5">
                <View className="flex-row items-center justify-between">
                  <Text className="text-[13px] text-white/48">Mode</Text>
                  <Text className="text-[14px] text-white/88">
                    {profile.preferences.mode || "Flexible"}
                  </Text>
                </View>
                <View className="h-px bg-white/[0.06]" />
                <View className="flex-row items-center justify-between">
                  <Text className="text-[13px] text-white/48">Format</Text>
                  <Text className="text-[14px] text-white/88">
                    {profile.preferences.format || "Both"}
                  </Text>
                </View>
                <View className="h-px bg-white/[0.06]" />
                <View className="flex-row items-center justify-between">
                  <Text className="text-[13px] text-white/48">Style</Text>
                  <Text className="text-[14px] text-white/88">
                    {profile.preferences.style || "Balanced"}
                  </Text>
                </View>
                <View className="h-px bg-white/[0.06]" />
                <View className="flex-row items-center justify-between">
                  <Text className="text-[13px] text-white/48">
                    Availability
                  </Text>
                  <Text className="text-[14px] text-white/88">
                    {availabilityDraft || profile.preferences.availability}
                  </Text>
                </View>
                <Pressable
                  className="mt-1 flex-row items-center gap-2"
                  onPress={beginPreferencesEdit}
                >
                  <Ionicons
                    color="rgba(255,255,255,0.78)"
                    name="options-outline"
                    size={14}
                  />
                  <Text className="text-[13px] font-medium text-white/80">
                    Edit preferences
                  </Text>
                </Pressable>
              </View>
            )}
          </Section>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(160).duration(260)}>
          <Section
            title="What OpenSocial Understands"
            subtitle="You can update this anytime."
          >
            <View className="gap-2">
              {profile.systemUnderstanding.map((line, index) => (
                <Text
                  className="text-[13px] leading-[20px] text-white/74"
                  key={index}
                >
                  {`\u2022 ${line}`}
                </Text>
              ))}
              <View className="mt-2 flex-row gap-2">
                <View className="flex-1">
                  <PrimaryButton
                    disabled={saving}
                    label={saving ? "Refreshing..." : "Refresh understanding"}
                    onPress={() => {
                      hapticImpact();
                      void refreshUnderstanding();
                    }}
                    variant="secondary"
                  />
                </View>
                <View className="flex-1">
                  <PrimaryButton
                    label="Refine preferences"
                    onPress={beginPreferencesEdit}
                    variant="ghost"
                  />
                </View>
              </View>
            </View>
          </Section>
        </Animated.View>

        {profile.persona ? (
          <Animated.View entering={FadeInUp.delay(200).duration(260)}>
            <Section title="Persona">
              <Text className="text-[16px] font-semibold text-white/92">
                {profile.persona}
              </Text>
              <Text className="mt-1 text-[13px] leading-[20px] text-white/62">
                A lightweight archetype based on your current interaction
                signals.
              </Text>
            </Section>
          </Animated.View>
        ) : null}

        <Animated.View entering={FadeInUp.delay(240).duration(260)}>
          <Section title="Controls">
            <View>
              <ActionRow
                icon="person-outline"
                label="Edit profile"
                onPress={beginBioEdit}
              />
              <View className="h-px bg-white/[0.05]" />
              <ActionRow
                icon="options-outline"
                label="Edit preferences"
                onPress={beginPreferencesEdit}
              />
              <View className="h-px bg-white/[0.05]" />
              <ActionRow
                icon="camera-outline"
                label="Update photo"
                onPress={openAvatarActions}
              />
              <View className="h-px bg-white/[0.05]" />
              <ActionRow
                icon="color-wand-outline"
                label="Refresh understanding"
                onPress={() => {
                  hapticSelection();
                  void refreshUnderstanding();
                }}
              />
            </View>
          </Section>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(280).duration(260)}>
          <Section title="Privacy">
            <View>
              <ActionRow
                icon="eye-outline"
                label="Visibility controls"
                onPress={beginPreferencesEdit}
              />
              <View className="h-px bg-white/[0.05]" />
              <ActionRow
                icon="shield-checkmark-outline"
                label="Safety preferences"
                onPress={beginPreferencesEdit}
              />
              <View className="h-px bg-white/[0.05]" />
              <ActionRow
                icon="log-out-outline"
                label="Sign out"
                onPress={() => {
                  hapticSelection();
                  void onResetSession();
                }}
              />
            </View>
          </Section>
        </Animated.View>
      </ScrollView>
    </View>
  );
}
