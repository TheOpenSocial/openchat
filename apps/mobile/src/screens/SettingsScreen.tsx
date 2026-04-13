import Ionicons from "@expo/vector-icons/Ionicons";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Image,
  LayoutChangeEvent,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { CalmTextField } from "../components/CalmTextField";
import { PrimaryButton } from "../components/PrimaryButton";
import { useLoadingModal } from "../hooks/useLoadingModal";
import { hapticSelection } from "../lib/haptics";
import { appTheme } from "../theme";
import type { UserProfileDraft } from "../types";
import { useSelfProfileData } from "./profile/useProfileData";
import { joinDisplayName, splitDisplayName } from "./settings/domain/name";
import { ProtocolIntegrationsPanel } from "./settings/ProtocolIntegrationsPanel";

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
    <Pressable
      accessibilityHint="Opens options to take or choose a new profile photo."
      accessibilityLabel="Change profile photo"
      accessibilityRole="button"
      accessibilityState={{ busy: uploading, disabled: uploading }}
      className="items-center"
      disabled={uploading}
      hitSlop={12}
      onPress={onPress}
    >
      <View className="h-32 w-32 items-center justify-center overflow-hidden rounded-[40px] border border-hairline bg-surfaceMuted/85">
        {avatarUrl ? (
          <Image
            className="h-full w-full"
            resizeMode="cover"
            source={{ uri: avatarUrl }}
          />
        ) : (
          <View className="h-full w-full items-center justify-center bg-surfaceMuted/70">
            <Text className="text-[32px] font-semibold tracking-[-0.04em] text-ink">
              {fallbackInitials}
            </Text>
          </View>
        )}
      </View>
      <View className="mt-4 flex-row items-center gap-2 rounded-full border border-hairline bg-surfaceMuted/85 px-3 py-2">
        <Ionicons color={appTheme.colors.ink} name="camera-outline" size={15} />
        <Text
          className="text-[12px] font-medium text-ink/90"
          allowFontScaling
          minimumFontScale={0.85}
        >
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
      <Text className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted">
        {eyebrow}
      </Text>
      <Text
        className="text-[32px] font-semibold tracking-[-0.05em] text-ink"
        allowFontScaling
        adjustsFontSizeToFit
        minimumFontScale={0.82}
        numberOfLines={2}
      >
        {title}
      </Text>
      <Text
        className="max-w-full text-[14px] leading-[21px] text-muted"
        allowFontScaling
        minimumFontScale={0.85}
      >
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
  const firstNameRef = useRef<TextInput>(null);
  const lastNameRef = useRef<TextInput>(null);
  const [footerHeight, setFooterHeight] = useState(0);

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

  const scrollBottomPadding = footerHeight > 0 ? footerHeight + 24 : 164;

  const handleFooterLayout = useCallback((event: LayoutChangeEvent) => {
    const nextHeight = Math.ceil(event.nativeEvent.layout.height);
    setFooterHeight((currentHeight) =>
      currentHeight === nextHeight ? currentHeight : nextHeight,
    );
  }, []);

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
      className="flex-1 bg-canvas"
      edges={["top", "bottom", "left", "right"]}
      style={{ flex: 1, backgroundColor: appTheme.colors.background }}
    >
      {loadingModal}

      <LinearGradient
        className="absolute inset-0"
        colors={[
          appTheme.colors.panelStrong,
          appTheme.colors.background,
          appTheme.colors.background,
        ]}
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
            accessibilityHint="Returns to the previous screen."
            accessibilityLabel="Close settings"
            accessibilityRole="button"
            accessibilityState={{ disabled: !onClose }}
            className="h-11 w-11 items-center justify-center"
            disabled={!onClose}
            hitSlop={8}
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
              color={onClose ? appTheme.colors.ink : "rgba(236,236,236,0)"}
              name="chevron-back"
              size={20}
            />
          </Pressable>
          <Text
            className="text-[13px] font-semibold uppercase tracking-[0.12em] text-muted"
            allowFontScaling
            minimumFontScale={0.85}
          >
            Settings
          </Text>
          <View className="h-9 w-9" />
        </View>

        <View style={{ flex: 1 }}>
          <ScrollView
            automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
            contentInsetAdjustmentBehavior="never"
            style={{ flex: 1 }}
            contentContainerStyle={{
              flexGrow: 1,
              paddingBottom: scrollBottomPadding,
              paddingHorizontal: 20,
              paddingTop: 12,
            }}
            keyboardDismissMode="interactive"
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
                  accessibilityHint="Enter your given name."
                  editable={!saving}
                  accessibilityLabel="First name"
                  inputClassName="text-ink"
                  label="First name"
                  onSubmitEditing={() => {
                    lastNameRef.current?.focus();
                  }}
                  onChangeText={setFirstName}
                  placeholder="Your first name"
                  placeholderTextColor={appTheme.colors.muted}
                  selectionColor={appTheme.colors.ink}
                  returnKeyType="next"
                  ref={firstNameRef}
                  blurOnSubmit={false}
                  value={firstName}
                />
                <CalmTextField
                  autoCapitalize="words"
                  autoCorrect={false}
                  containerClassName="gap-2"
                  accessibilityHint="Enter your family name."
                  editable={!saving}
                  accessibilityLabel="Last name"
                  helperText="We currently save this as one display name under the hood."
                  inputClassName="text-ink"
                  label="Last name"
                  onChangeText={setLastName}
                  placeholder="Your last name"
                  placeholderTextColor={appTheme.colors.muted}
                  selectionColor={appTheme.colors.ink}
                  returnKeyType="done"
                  ref={lastNameRef}
                  value={lastName}
                />
              </View>

              {error ? (
                <Text className="text-[13px] leading-[19px] text-[#fca5a5]">
                  {error}
                </Text>
              ) : null}

              <ProtocolIntegrationsPanel />
            </View>
          </ScrollView>
        </View>

        <View
          className="border-t border-hairline bg-surfaceMuted/95 px-5 pb-8 pt-5"
          onLayout={handleFooterLayout}
        >
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
