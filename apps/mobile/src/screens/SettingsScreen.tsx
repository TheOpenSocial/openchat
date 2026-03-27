import Ionicons from "@expo/vector-icons/Ionicons";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { CalmTextField } from "../components/CalmTextField";
import { PrimaryButton } from "../components/PrimaryButton";
import { useLoadingModal } from "../hooks/useLoadingModal";
import { hapticSelection } from "../lib/haptics";
import type { UserProfileDraft } from "../types";
import { useSelfProfileData } from "./profile/useProfileData";
import { joinDisplayName, splitDisplayName } from "./settings/domain/name";

type SettingsScreenProps = {
  accessToken: string;
  displayName: string;
  email?: string | null;
  initialDraft: UserProfileDraft;
  userId: string;
  onClose?: () => void;
  onProfileUpdated: (profile: UserProfileDraft) => void;
};

type AvatarSource = "camera" | "library";

function NameAvatar({
  avatarUrl,
  fallbackInitials,
  onPress,
  uploading,
}: {
  avatarUrl?: string;
  fallbackInitials: string;
  onPress: () => void;
  uploading: boolean;
}) {
  return (
    <Pressable className="items-center" disabled={uploading} onPress={onPress}>
      <View className="h-32 w-32 items-center justify-center overflow-hidden rounded-[40px] border border-white/10 bg-white/[0.05]">
        {avatarUrl ? (
          <Image
            className="h-full w-full"
            resizeMode="cover"
            source={{ uri: avatarUrl }}
          />
        ) : (
          <View className="h-full w-full items-center justify-center bg-white/[0.04]">
            <Text className="text-[32px] font-semibold tracking-[-0.04em] text-white/90">
              {fallbackInitials}
            </Text>
          </View>
        )}
      </View>
      <View className="mt-4 flex-row items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2">
        <Ionicons
          color="rgba(255,255,255,0.82)"
          name="camera-outline"
          size={15}
        />
        <Text className="text-[12px] font-medium text-white/76">
          {uploading ? "Uploading photo" : "Change photo"}
        </Text>
      </View>
    </Pressable>
  );
}

function SectionLabel({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
}) {
  return (
    <View className="gap-2">
      <Text className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/36">
        {eyebrow}
      </Text>
      <Text className="text-[32px] font-semibold tracking-[-0.05em] text-white/96">
        {title}
      </Text>
      <Text className="max-w-[310px] text-[14px] leading-[21px] text-white/52">
        {subtitle}
      </Text>
    </View>
  );
}

export function SettingsScreen({
  accessToken,
  displayName,
  email,
  initialDraft,
  onClose,
  onProfileUpdated,
  userId,
}: SettingsScreenProps) {
  const { avatarUploading, error, profile, save, saving, updateAvatar } =
    useSelfProfileData({
      accessToken,
      displayName,
      email,
      initialDraft,
      userId,
    });

  const initialName = useMemo(
    () => splitDisplayName(profile.name || displayName),
    [displayName, profile.name],
  );
  const [firstName, setFirstName] = useState(initialName.firstName);
  const [lastName, setLastName] = useState(initialName.lastName);

  const shouldUseNativePhotoCrop = Platform.OS !== "ios";
  const { hide, loadingModal, show } = useLoadingModal({
    initialMessage: "Uploading and saving your profile picture",
    minVisibleMs: 2000,
  });

  useEffect(() => {
    setFirstName(initialName.firstName);
    setLastName(initialName.lastName);
  }, [initialName.firstName, initialName.lastName]);

  useEffect(() => {
    if (avatarUploading) {
      show("Uploading and saving your profile picture");
      return;
    }

    if (saving) {
      show("Saving your profile settings");
      return;
    }

    hide();
  }, [avatarUploading, hide, saving, show]);

  const fullName = useMemo(
    () =>
      joinDisplayName({
        firstName,
        lastName,
      }),
    [firstName, lastName],
  );

  const fallbackInitials = useMemo(() => {
    const initials = [firstName.trim(), lastName.trim()]
      .filter(Boolean)
      .map((value) => value.charAt(0).toUpperCase())
      .join("");

    if (initials) {
      return initials.slice(0, 2);
    }

    return (profile.name.trim().charAt(0) || "U").toUpperCase();
  }, [firstName, lastName, profile.name]);

  const hasChanges = useMemo(() => {
    const currentName = splitDisplayName(profile.name || displayName);

    return (
      currentName.firstName !== firstName.trim() ||
      currentName.lastName !== lastName.trim()
    );
  }, [displayName, firstName, lastName, profile.name]);

  const handleAvatarPick = useCallback(
    async (source: AvatarSource) => {
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

      if (result.canceled || !result.assets[0]) {
        return;
      }

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
      } catch (nextError) {
        Alert.alert(
          "Photo not uploaded",
          nextError instanceof Error
            ? nextError.message
            : "Try again in a moment.",
        );
      }
    },
    [avatarUploading, shouldUseNativePhotoCrop, updateAvatar],
  );

  const openAvatarActions = useCallback(() => {
    if (avatarUploading) {
      return;
    }

    Alert.alert("Profile photo", "Choose how to update your photo.", [
      {
        text: "Take photo",
        onPress: () => {
          void handleAvatarPick("camera");
        },
      },
      {
        text: "Choose from library",
        onPress: () => {
          void handleAvatarPick("library");
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
  }, [avatarUploading, handleAvatarPick]);

  const handleSave = useCallback(async () => {
    if (!fullName) {
      Alert.alert("Name required", "Add at least a first name to continue.");
      return;
    }

    try {
      await save({
        displayName: fullName,
      });

      onProfileUpdated({
        ...initialDraft,
        displayName: fullName,
      });
      hapticSelection();
    } finally {
      // no-op: loading modal lifetime is centralized in useLoadingModal
    }
  }, [fullName, initialDraft, onProfileUpdated, save]);

  return (
    <SafeAreaView
      className="flex-1 bg-[#050506]"
      edges={["top", "bottom", "left", "right"]}
      style={{ flex: 1, backgroundColor: "#050506" }}
    >
      {loadingModal}

      <LinearGradient
        className="absolute inset-0"
        colors={["#0a0b0d", "#050506", "#050506"]}
        end={{ x: 0.9, y: 1 }}
        start={{ x: 0.15, y: 0 }}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
        style={{ flex: 1 }}
      >
        <View className="flex-row items-center justify-between px-5 pb-2 pt-2">
          <Pressable
            className="h-9 w-9 items-center justify-center"
            disabled={!onClose}
            onPress={() => {
              if (!onClose) {
                return;
              }
              hapticSelection();
              onClose();
            }}
            testID="settings-close"
          >
            <Ionicons
              color={onClose ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0)"}
              name="chevron-back"
              size={20}
            />
          </Pressable>
          <Text className="text-[13px] font-semibold uppercase tracking-[0.12em] text-white/48">
            Settings
          </Text>
          <View className="h-9 w-9" />
        </View>

        <View style={{ flex: 1 }}>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{
              paddingBottom: 164,
              paddingHorizontal: 20,
              paddingTop: 12,
            }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={{ gap: 40 }}>
              <View style={{ gap: 32 }}>
                <SectionLabel
                  eyebrow="Settings"
                  subtitle="Keep your identity simple and current. Your name and photo should feel like you."
                  title="Profile settings"
                />

                <View className="items-center pt-2">
                  <NameAvatar
                    avatarUrl={profile.avatarUrl}
                    fallbackInitials={fallbackInitials}
                    onPress={openAvatarActions}
                    uploading={avatarUploading}
                  />
                </View>
              </View>

              <View style={{ gap: 16 }}>
                <CalmTextField
                  autoCapitalize="words"
                  autoCorrect={false}
                  containerClassName="gap-2"
                  editable={!saving}
                  label="First name"
                  onChangeText={setFirstName}
                  placeholder="Your first name"
                  returnKeyType="next"
                  value={firstName}
                />
                <CalmTextField
                  autoCapitalize="words"
                  autoCorrect={false}
                  containerClassName="gap-2"
                  editable={!saving}
                  helperText="We currently save this as one display name under the hood."
                  label="Last name"
                  onChangeText={setLastName}
                  placeholder="Your last name"
                  returnKeyType="done"
                  value={lastName}
                />
              </View>

              {error ? (
                <Text className="text-[13px] leading-[19px] text-[#fca5a5]">
                  {error}
                </Text>
              ) : null}
            </View>
          </ScrollView>
        </View>

        <View className="border-t border-white/[0.06] bg-[#050506]/95 px-5 pb-8 pt-5">
          <PrimaryButton
            disabled={!hasChanges || saving || avatarUploading}
            label="Save changes"
            onPress={() => {
              void handleSave();
            }}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
