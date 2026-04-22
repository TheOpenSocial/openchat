import Ionicons from "@expo/vector-icons/Ionicons";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, { FadeInUp } from "react-native-reanimated";

import { PrimaryButton } from "../components/PrimaryButton";
import { hapticSelection } from "../lib/haptics";
import { useKeyboardVisible } from "../hooks/useKeyboardVisible";
import { useLoadingModal } from "../hooks/useLoadingModal";
import { appTheme } from "../theme";
import type { UserProfileDraft } from "../types";
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
  sectionGap: 24,
};

const NOTIFICATION_LABELS: Record<"immediate" | "digest" | "quiet", string> = {
  immediate: "Live",
  digest: "Digest",
  quiet: "Quiet",
};

function GlassPanel({
  children,
  className = "",
  innerClassName = "",
  style,
}: {
  children: React.ReactNode;
  className?: string;
  innerClassName?: string;
  style?: object;
}) {
  return (
    <View
      className={`overflow-hidden rounded-[30px] border border-hairline bg-surfaceMuted/75 ${className}`}
      style={[
        {
          shadowColor: "#000000",
          shadowOffset: { width: 0, height: 12 },
          shadowOpacity: 0.06,
          shadowRadius: 20,
        },
        style,
      ]}
    >
      <View pointerEvents="none" className="absolute inset-0 bg-surface/30" />
      <View className={innerClassName}>{children}</View>
    </View>
  );
}

function Chip({
  label,
  active = false,
  onPress,
  testID,
  tone = "light",
  testID,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  testID?: string;
  tone?: "light" | "dark";
  testID?: string;
}) {
  const activeClass =
    tone === "dark" ? "border-ink bg-ink" : "border-ink bg-ink";
  const idleClass =
    tone === "dark"
      ? "border-hairline bg-surfaceMuted/70"
      : "border-hairline bg-surfaceMuted/70";
  const activeText = "text-canvas";
  const idleText = "text-ink/88";

  const content = (
    <View
      className={`rounded-full px-3 py-1.5 ${
        active ? `border ${activeClass}` : `border ${idleClass}`
      }`}
    >
      <Text
        className={`text-[12px] font-semibold ${
          active ? activeText : idleText
        }`}
      >
        {label}
      </Text>
    </View>
  );

  if (!onPress) {
    return <View testID={testID}>{content}</View>;
  }

  return (
    <Pressable onPress={onPress} testID={testID}>
      {content}
    </Pressable>
  );
}

function Section({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ marginTop: PROFILE_SPACING.sectionGap }}>
      {eyebrow ? (
        <Text className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
          {eyebrow}
        </Text>
      ) : null}
      <Text className="mt-2 text-[24px] font-semibold tracking-[-0.03em] text-ink">
        {title}
      </Text>
      {subtitle ? (
        <Text className="mt-2 max-w-[340px] text-[14px] leading-[21px] text-muted">
          {subtitle}
        </Text>
      ) : null}
      <GlassPanel className="mt-4" innerClassName="px-4 py-4">
        {children}
      </GlassPanel>
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value?: string }) {
  return (
    <View className="flex-row items-center justify-between gap-4 py-2.5">
      <Text className="text-[13px] text-muted">{label}</Text>
      <Text className="max-w-[58%] text-right text-[14px] text-ink/90">
        {value || "Not set"}
      </Text>
    </View>
  );
}

function ActionRow({
  icon,
  label,
  onPress,
  testID,
  tone = "default",
  testID,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  testID?: string;
  tone?: "default" | "danger";
  testID?: string;
}) {
  const iconColor =
    tone === "danger" ? appTheme.colors.danger : appTheme.colors.ink;
  const textColor = tone === "danger" ? "text-[#ff9f93]" : "text-ink/90";

  return (
    <Pressable
      className="flex-row items-center justify-between py-3"
      onPress={onPress}
      testID={testID}
    >
      <View className="flex-row items-center gap-3">
        <Ionicons color={iconColor} name={icon} size={16} />
        <Text className={`text-[14px] ${textColor}`}>{label}</Text>
      </View>
      <Ionicons
        color={
          tone === "danger"
            ? "rgba(255,159,147,0.56)"
            : "rgba(236,236,236,0.42)"
        }
        name="chevron-forward"
        size={15}
      />
    </Pressable>
  );
}

function notificationModeToDraftValue(
  value: UserProfileDraft["notificationMode"],
): "immediate" | "digest" | "quiet" {
  return value === "digest" ? "digest" : "immediate";
}

function notificationModeFromLabel(
  value?: string,
): "immediate" | "digest" | "quiet" {
  if (value === "Digest") return "digest";
  if (value === "Quiet") return "quiet";
  return "immediate";
}

function socialModeFromProfile(
  value: string | undefined,
  fallback: UserProfileDraft["socialMode"],
): UserProfileDraft["socialMode"] {
  if (value === "group" || value === "either" || value === "one_to_one") {
    return value;
  }
  return fallback;
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
  const keyboardVisible = useKeyboardVisible();
  const {
    avatarUploading,
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
  const scrollViewRef = useRef<ScrollView>(null);
  const [bioSectionY, setBioSectionY] = useState<number | null>(null);
  const [interestsSectionY, setInterestsSectionY] = useState<number | null>(
    null,
  );
  const [preferencesSectionY, setPreferencesSectionY] = useState<number | null>(
    null,
  );
  const [bioDraft, setBioDraft] = useState("");
  const [locationDraft, setLocationDraft] = useState("");
  const [interestsDraft, setInterestsDraft] = useState("");
  const [modeDraft, setModeDraft] = useState(initialDraft.socialMode);
  const [availabilityDraft, setAvailabilityDraft] = useState(
    profile.preferences.availability ?? "Evenings and weekends",
  );
  const [notificationDraft, setNotificationDraft] = useState<
    "immediate" | "digest" | "quiet"
  >(notificationModeToDraftValue(initialDraft.notificationMode));

  const initial = useMemo(
    () => (profile.name.trim().charAt(0) || "U").toUpperCase(),
    [profile.name],
  );
  const shouldUseNativePhotoCrop = Platform.OS !== "ios";
  const { hide, loadingModal, show } = useLoadingModal({
    initialMessage: "Uploading and saving your profile picture",
  });

  useEffect(() => {
    if (avatarUploading) {
      show("Uploading and saving your profile picture");
      return;
    }
    hide();
  }, [avatarUploading, hide, show]);

  const scrollToSection = (targetY: number | null) => {
    if (targetY == null) {
      return;
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scrollViewRef.current?.scrollTo({
          animated: true,
          y: Math.max(0, targetY - 24),
        });
      });
    });
  };

  const beginBioEdit = () => {
    setBioDraft(profile.bio ?? "");
    setLocationDraft(profile.location ?? "");
    setEditingBio(true);
    scrollToSection(bioSectionY);
  };

  const beginInterestsEdit = () => {
    setInterestsDraft(profile.interests.join(", "));
    setEditingInterests(true);
    scrollToSection(interestsSectionY);
  };

  const beginPreferencesEdit = () => {
    setModeDraft(
      socialModeFromProfile(profile.preferences.mode, initialDraft.socialMode),
    );
    setAvailabilityDraft(profile.preferences.availability ?? "");
    setNotificationDraft(
      notificationModeFromLabel(profile.preferences.notifications),
    );
    setEditingPreferences(true);
    scrollToSection(preferencesSectionY);
  };

  const pickAndUploadAvatar = async (source: "camera" | "library") => {
    if (avatarUploading) {
      return;
    }

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
            allowsEditing: shouldUseNativePhotoCrop,
            ...(shouldUseNativePhotoCrop
              ? { aspect: [9, 16] as [number, number] }
              : {}),
            quality: 0.85,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            allowsEditing: shouldUseNativePhotoCrop,
            ...(shouldUseNativePhotoCrop
              ? { aspect: [9, 16] as [number, number] }
              : {}),
            quality: 0.85,
          });

    if (result.canceled || !result.assets[0]) return;

    try {
      await updateAvatar({
        uri: result.assets[0].uri,
        mimeType: result.assets[0].mimeType ?? null,
        fileSize:
          typeof result.assets[0].fileSize === "number"
            ? result.assets[0].fileSize
            : null,
      });
      hapticSelection();
    } catch (error) {
      Alert.alert(
        "Photo not uploaded",
        error instanceof Error ? error.message : "Try again in a moment.",
      );
    }
  };

  const openAvatarActions = () => {
    if (avatarUploading) {
      return;
    }

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
      notificationMode: notificationDraft,
    });
    setEditingPreferences(false);
    onProfileUpdated({
      ...initialDraft,
      socialMode: modeDraft,
      notificationMode: notificationDraft === "immediate" ? "live" : "digest",
    });
    hapticSelection();
  };

  return (
    <View className="flex-1 bg-[#0b0d10] pt-2" testID="profile-screen">
      {loadingModal}
      <LinearGradient
        colors={["#0f1216", "#0b0d10", "#090a0d"]}
        end={{ x: 0.8, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={StyleSheet.absoluteFillObject}
      />

      <ScrollView
        ref={scrollViewRef}
        className="flex-1"
        contentContainerStyle={{
          paddingBottom:
            editingBio && keyboardVisible
              ? 320
              : editingInterests && keyboardVisible
                ? 260
                : 180,
          paddingHorizontal: PROFILE_SPACING.outerX,
          paddingTop: 20,
        }}
      >
        <Animated.View
          entering={FadeInUp.delay(30).duration(260)}
          style={{ marginTop: 8 }}
        >
          <View
            className="overflow-hidden rounded-[32px]"
            style={{
              shadowColor: "#000000",
              shadowOffset: { width: 0, height: 18 },
              shadowOpacity: 0.1,
              shadowRadius: 26,
            }}
          >
            <View className="h-[500px] overflow-hidden rounded-[32px] border border-hairline bg-surface">
              {profile.avatarUrl ? (
                <Image
                  source={{ uri: profile.avatarUrl }}
                  className="absolute inset-0 h-full w-full"
                  resizeMode="cover"
                />
              ) : (
                <LinearGradient
                  colors={["#adc8df", "#d8d5c7", "#b8c59f"]}
                  end={{ x: 1, y: 1 }}
                  start={{ x: 0, y: 0 }}
                  style={StyleSheet.absoluteFillObject}
                />
              )}

              <View
                pointerEvents="none"
                style={[
                  StyleSheet.absoluteFillObject,
                  {
                    borderRadius: 32,
                    borderWidth: 1,
                    borderColor: appTheme.colors.hairline,
                  },
                ]}
              />

              <LinearGradient
                colors={["rgba(236,236,236,0.18)", "rgba(236,236,236,0)"]}
                end={{ x: 0.5, y: 1 }}
                start={{ x: 0.5, y: 0 }}
                style={{
                  height: 90,
                  left: 0,
                  position: "absolute",
                  right: 0,
                  top: 0,
                }}
              />

              <View className="flex-1 justify-between px-5 pb-5 pt-5">
                <View className="flex-row items-center justify-between">
                  <Chip label="OpenSocial" tone="dark" />
                  {profile.location ? (
                    <Chip label={profile.location} tone="dark" />
                  ) : null}
                </View>

                <View className="items-center">
                  <View className="overflow-hidden rounded-full border border-hairline bg-surfaceMuted/75">
                    {profile.avatarUrl ? (
                      <Pressable
                        disabled={avatarUploading}
                        onPress={openAvatarActions}
                      >
                        <Image
                          source={{ uri: profile.avatarUrl }}
                          className="h-24 w-24"
                          resizeMode="cover"
                        />
                      </Pressable>
                    ) : (
                      <Pressable
                        disabled={avatarUploading}
                        className="h-24 w-24 items-center justify-center"
                        onPress={openAvatarActions}
                      >
                        <Text className="text-[30px] font-semibold text-ink">
                          {initial}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                </View>

                <View>
                  <Text className="text-[33px] font-semibold leading-[37px] tracking-[-0.04em] text-ink">
                    {profile.name}
                  </Text>
                  <Text className="mt-2 max-w-[290px] text-[15px] leading-[22px] text-muted">
                    {profile.preferences.style
                      ? `${profile.preferences.style} energy`
                      : "Warm energy"}
                  </Text>
                  <Text className="mt-3 max-w-[294px] text-[14px] leading-[21px] text-ink/90">
                    {profile.bio ||
                      "Curious, warm, and here to meet people who feel easy to talk to."}
                  </Text>

                  <View className="mt-4 flex-row flex-wrap gap-2">
                    {profile.persona ? (
                      <Chip label={profile.persona} tone="dark" />
                    ) : null}
                    {profile.preferences.format ? (
                      <Chip label={profile.preferences.format} tone="dark" />
                    ) : null}
                    {profile.preferences.style ? (
                      <Chip label={profile.preferences.style} tone="dark" />
                    ) : null}
                  </View>

                  <View className="mt-5 flex-row gap-3">
                    <GlassPanel
                      className="flex-1 rounded-full"
                      innerClassName="px-4 py-3"
                    >
                      <Pressable
                        onPress={beginBioEdit}
                        testID="profile-action-edit"
                      >
                        <Text className="text-center text-[15px] font-semibold text-ink">
                          Edit profile
                        </Text>
                      </Pressable>
                    </GlassPanel>
                    <GlassPanel
                      className="flex-1 rounded-full"
                      innerClassName="px-4 py-3"
                    >
                      <Pressable
                        onPress={beginPreferencesEdit}
                        testID="profile-action-preferences"
                      >
                        <Text className="text-center text-[15px] font-semibold text-ink">
                          Match preferences
                        </Text>
                      </Pressable>
                    </GlassPanel>
                  </View>
                </View>
              </View>
            </View>
          </View>

          {loading ? (
            <View className="mt-4 flex-row items-center justify-center gap-2">
              <ActivityIndicator color={appTheme.colors.muted} size="small" />
              <Text className="text-[12px] text-muted">Loading profile...</Text>
            </View>
          ) : null}
          {error ? (
            <Text className="mt-4 text-center text-[12px] text-[#b42318]">
              {error}
            </Text>
          ) : null}
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(40).duration(260)}>
          <Section
            eyebrow="System understanding"
            title="What OpenSocial sees"
            subtitle="Fast context for how the system currently understands you."
          >
            <View>
              <Text className="text-[15px] leading-[24px] text-ink/90">
                {profile.systemUnderstanding[0] ||
                  "OpenSocial is still learning your preferences."}
              </Text>
              <View className="mt-4 flex-row flex-wrap gap-2">
                {profile.interests.slice(0, 4).map((interest) => (
                  <Chip key={interest} label={interest} />
                ))}
                {profile.preferences.format ? (
                  <Chip label={profile.preferences.format} />
                ) : null}
                {profile.preferences.style ? (
                  <Chip label={profile.preferences.style} />
                ) : null}
                {profile.preferences.availability ? (
                  <Chip label={profile.preferences.availability} />
                ) : null}
              </View>
              {profile.systemUnderstanding.length > 1 ? (
                <View className="mt-4 gap-3">
                  {profile.systemUnderstanding
                    .slice(1, 3)
                    .map((line, index) => (
                      <View className="flex-row gap-3" key={`${line}-${index}`}>
                        <View className="mt-1.5 h-2 w-2 rounded-full bg-accent" />
                        <Text className="min-w-0 flex-1 text-[14px] leading-[21px] text-ink/88">
                          {line}
                        </Text>
                      </View>
                    ))}
                </View>
              ) : null}
            </View>
          </Section>
        </Animated.View>

        <Animated.View
          entering={FadeInUp.delay(80).duration(260)}
          onLayout={(event) => {
            setPreferencesSectionY(event.nativeEvent.layout.y);
          }}
        >
          <Section
            eyebrow="How you connect"
            title="Connection profile"
            subtitle="Clean, structured preferences the matching layer can read instantly."
          >
            {editingPreferences ? (
              <View className="gap-4">
                <View>
                  <Text className="mb-3 text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">
                    Mode
                  </Text>
                  <View className="flex-row flex-wrap gap-2">
                    {[
                      { key: "one_to_one", label: "1:1" },
                      { key: "group", label: "Groups" },
                      { key: "either", label: "Both" },
                    ].map((option) => (
                      <Chip
                        active={modeDraft === option.key}
                        key={option.key}
                        label={option.label}
                        onPress={() => {
                          setModeDraft(
                            option.key as UserProfileDraft["socialMode"],
                          );
                        }}
                        testID={`profile-preference-mode-${option.key}`}
                      />
                    ))}
                  </View>
                </View>

                <View>
                  <Text className="mb-3 text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">
                    Notifications
                  </Text>
                  <View className="flex-row flex-wrap gap-2">
                    {(
                      ["immediate", "digest", "quiet"] as Array<
                        "immediate" | "digest" | "quiet"
                      >
                    ).map((mode) => (
                      <Chip
                        active={notificationDraft === mode}
                        key={mode}
                        label={NOTIFICATION_LABELS[mode]}
                        onPress={() => {
                          setNotificationDraft(mode);
                        }}
                        testID={`profile-preference-notification-${mode}`}
                      />
                    ))}
                  </View>
                </View>

                <View className="rounded-[18px] border border-hairline bg-surfaceMuted/75 px-4 py-3">
                  <Text className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">
                    Availability
                  </Text>
                  <Text className="mt-2 text-[14px] text-ink/90">
                    {availabilityDraft || "Evenings and weekends"}
                  </Text>
                </View>

                <View className="flex-row gap-2">
                  <View className="flex-1">
                    <PrimaryButton
                      disabled={saving}
                      label="Cancel"
                      onPress={() => setEditingPreferences(false)}
                      testID="profile-preferences-cancel"
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
                      testID="profile-preferences-save"
                    />
                  </View>
                </View>
              </View>
            ) : (
              <View>
                <DetailRow label="Mode" value={profile.preferences.mode} />
                <View className="h-px bg-hairline/70" />
                <DetailRow label="Format" value={profile.preferences.format} />
                <View className="h-px bg-hairline/70" />
                <DetailRow label="Style" value={profile.preferences.style} />
                <View className="h-px bg-hairline/70" />
                <DetailRow
                  label="Availability"
                  value={profile.preferences.availability}
                />
              </View>
            )}
          </Section>
        </Animated.View>

        {profile.persona ? (
          <Animated.View entering={FadeInUp.delay(120).duration(260)}>
            <Section
              eyebrow="Persona"
              title={profile.persona}
              subtitle="A lightweight archetype derived from your current preferences."
            >
              <Text className="text-[15px] leading-[24px] text-ink/90">
                {profile.preferences.style
                  ? `Prefers ${profile.preferences.style.toLowerCase()} interactions and ${profile.preferences.format?.toLowerCase() || "flexible"} formats.`
                  : "OpenSocial uses this to keep matching and intros consistent."}
              </Text>
            </Section>
          </Animated.View>
        ) : null}

        <Animated.View entering={FadeInUp.delay(160).duration(260)}>
          <Section
            eyebrow="Actions"
            title="Profile controls"
            subtitle="Refine the profile without turning it into a settings page."
          >
            <View>
              <ActionRow
                icon="person-outline"
                label="Edit profile"
                onPress={beginBioEdit}
                testID="profile-action-edit"
              />
              <View className="h-px bg-hairline/70" />
              <ActionRow
                icon="options-outline"
                label="Refine preferences"
                onPress={beginPreferencesEdit}
                testID="profile-action-preferences"
              />
              <View className="h-px bg-hairline/70" />
              <ActionRow
                icon="add-circle-outline"
                label="Update interests"
                onPress={beginInterestsEdit}
                testID="profile-action-interests"
              />
              <View className="h-px bg-hairline/70" />
              <ActionRow
                icon="sparkles-outline"
                label="Reset understanding"
                onPress={() => {
                  hapticSelection();
                  void refreshUnderstanding();
                }}
                testID="profile-action-refresh-understanding"
              />
              <View className="h-px bg-hairline/70" />
              <ActionRow
                icon="camera-outline"
                label="Update profile photo"
                onPress={openAvatarActions}
                testID="profile-action-photo"
              />
              <View className="h-px bg-hairline/70" />
              <ActionRow
                icon="log-out-outline"
                label="Sign out"
                onPress={() => {
                  hapticSelection();
                  void onResetSession();
                }}
                testID="profile-action-sign-out"
                tone="danger"
                testID="profile-action-sign-out"
              />
            </View>
          </Section>
        </Animated.View>

        <Animated.View
          entering={FadeInUp.delay(200).duration(260)}
          onLayout={(event) => {
            setBioSectionY(event.nativeEvent.layout.y);
          }}
        >
          <Section
            eyebrow="Identity"
            title="Edit profile"
            subtitle="Keep your self-description concise and scannable."
          >
            {editingBio ? (
              <View className="gap-3">
                <TextInput
                  className="rounded-[18px] border border-hairline bg-surfaceMuted/75 px-4 py-3 text-[14px] leading-[21px] text-ink"
                  multiline
                  onChangeText={setBioDraft}
                  placeholder="What are you into? What kind of people or plans are you hoping to find?"
                  placeholderTextColor={appTheme.colors.muted}
                  selectionColor={appTheme.colors.ink}
                  testID="profile-bio-input"
                  value={bioDraft}
                />
                <TextInput
                  className="rounded-[18px] border border-hairline bg-surfaceMuted/75 px-4 py-3 text-[14px] text-ink"
                  onChangeText={setLocationDraft}
                  placeholder="City, Country"
                  placeholderTextColor={appTheme.colors.muted}
                  selectionColor={appTheme.colors.ink}
                  testID="profile-location-input"
                  value={locationDraft}
                />
                <View className="flex-row gap-2">
                  <View className="flex-1">
                    <PrimaryButton
                      disabled={saving}
                      label="Cancel"
                      onPress={() => setEditingBio(false)}
                      testID="profile-bio-cancel"
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
                      testID="profile-bio-save"
                    />
                  </View>
                </View>
              </View>
            ) : (
              <View>
                <Text className="text-[15px] leading-[24px] text-ink/90">
                  {profile.bio ||
                    "Add a short intro so people immediately understand your energy."}
                </Text>
                <Text className="mt-3 text-[13px] text-muted">
                  {profile.location ||
                    "Add a city if you want to make local matches easier."}
                </Text>
              </View>
            )}
          </Section>
        </Animated.View>

        <Animated.View
          entering={FadeInUp.delay(240).duration(260)}
          onLayout={(event) => {
            setInterestsSectionY(event.nativeEvent.layout.y);
          }}
        >
          <Section
            eyebrow="Interests"
            title="Interest signals"
            subtitle="Short, high-signal topics are more useful than long lists."
          >
            {editingInterests ? (
              <View className="gap-3">
                <TextInput
                  className="rounded-[18px] border border-hairline bg-surfaceMuted/75 px-4 py-3 text-[14px] text-ink"
                  onChangeText={setInterestsDraft}
                  placeholder="AI, design, football, startup dinners"
                  placeholderTextColor={appTheme.colors.muted}
                  selectionColor={appTheme.colors.ink}
                  testID="profile-interests-input"
                  value={interestsDraft}
                />
                <View className="flex-row gap-2">
                  <View className="flex-1">
                    <PrimaryButton
                      disabled={saving}
                      label="Cancel"
                      onPress={() => setEditingInterests(false)}
                      testID="profile-interests-cancel"
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
                      testID="profile-interests-save"
                    />
                  </View>
                </View>
              </View>
            ) : (
              <View className="flex-row flex-wrap gap-2">
                {profile.interests.length > 0 ? (
                  profile.interests.map((interest) => (
                    <Chip key={interest} label={interest} />
                  ))
                ) : (
                  <Text className="text-[13px] text-muted">
                    Add a few interests so the system has clearer signal.
                  </Text>
                )}
              </View>
            )}
          </Section>
        </Animated.View>
      </ScrollView>
    </View>
  );
}
