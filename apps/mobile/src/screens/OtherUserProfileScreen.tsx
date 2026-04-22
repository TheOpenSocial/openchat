import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import Animated, { FadeInUp } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import { PrimaryButton } from "../components/PrimaryButton";
import { hapticImpact, hapticSelection } from "../lib/haptics";
import { appTheme } from "../theme";
import { useOtherUserProfileData } from "./profile/useProfileData";

export type OtherProfileContext = {
  source: "chat" | "request";
  reason?: string;
  sharedTopics?: string[];
  lastInteraction?: string;
};

type OtherUserProfileScreenProps = {
  accessToken: string;
  context: OtherProfileContext;
  currentUserId: string;
  onAcceptRequest?: () => void;
  onClose: () => void;
  onDeclineRequest?: () => void;
  onStartConversation?: () => void;
  targetUserId: string;
};

function Chip({ label }: { label: string }) {
  return (
    <View className="rounded-full border border-hairline bg-surfaceMuted/80 px-3 py-1.5">
      <Text className="text-[12px] font-medium text-ink/90">{label}</Text>
    </View>
  );
}

export function OtherUserProfileScreen({
  accessToken,
  context,
  currentUserId,
  onAcceptRequest,
  onClose,
  onDeclineRequest,
  onStartConversation,
  targetUserId,
}: OtherUserProfileScreenProps) {
  const { block, error, loading, profile, report } = useOtherUserProfileData({
    accessToken,
    contextReason: context.reason,
    currentUserId,
    lastInteraction: context.lastInteraction,
    sharedTopics: context.sharedTopics,
    targetUserId,
  });
  const [busyAction, setBusyAction] = useState<"report" | "block" | null>(null);
  const allInterests = profile?.interests ?? [];
  const sharedTopics = profile?.context?.sharedTopics ?? [];
  const quickReason =
    profile?.context?.reason || context.reason || "Suggested by OpenSocial.";
  const sharedSet = new Set(sharedTopics.map((item) => item.toLowerCase()));
  const otherInterests = allInterests.filter(
    (interest) => !sharedSet.has(interest.toLowerCase()),
  );
  const iconButtonClassName = "h-11 w-11 items-center justify-center";

  const runModerationAction = async (kind: "report" | "block") => {
    setBusyAction(kind);
    try {
      if (kind === "report") {
        await report();
      } else {
        await block();
      }
      hapticSelection();
      onClose();
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <SafeAreaView
      className="absolute inset-0 z-40 bg-canvas"
      edges={["top", "bottom", "left", "right"]}
      testID="other-profile-screen"
    >
      <View className="flex-row items-center justify-between px-5 pb-3 pt-2">
        <Pressable
          accessibilityHint="Returns to the previous screen."
          accessibilityLabel="Close profile"
          accessibilityRole="button"
          className={iconButtonClassName}
          hitSlop={10}
          onPress={() => {
            hapticSelection();
            onClose();
          }}
          testID="other-profile-close"
        >
          <Ionicons color={appTheme.colors.ink} name="chevron-back" size={20} />
        </Pressable>
        <Text className="text-[13px] font-semibold uppercase tracking-[0.12em] text-muted">
          Profile
        </Text>
        <Pressable
          accessibilityHint="Opens profile moderation actions."
          accessibilityLabel="Profile actions"
          accessibilityRole="button"
          className={iconButtonClassName}
          hitSlop={10}
          onPress={() => {
            hapticSelection();
            void runModerationAction("report");
          }}
        >
          <Ionicons
            color={appTheme.colors.ink}
            name="ellipsis-horizontal"
            size={16}
          />
        </Pressable>
      </View>
      {!loading && profile ? (
        <View className="mx-5 mb-2 rounded-[14px] border border-hairline bg-surfaceMuted/80 px-3 py-2.5">
          <Text className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
            Why you are seeing this
          </Text>
          <Text
            className="mt-1 text-[13px] leading-[18px] text-ink/90"
            numberOfLines={2}
          >
            {quickReason}
          </Text>
        </View>
      ) : null}

      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: 128 }}
      >
        {loading || !profile ? (
          <View className="mt-16 flex-row items-center gap-2">
            <ActivityIndicator color={appTheme.colors.muted} size="small" />
            <Text className="text-[13px] text-muted">Loading profile...</Text>
          </View>
        ) : (
          <>
            <Animated.View entering={FadeInUp.duration(240)}>
              <View className="h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-surfaceMuted/80">
                {profile.avatarUrl ? (
                  <Image
                    source={{ uri: profile.avatarUrl }}
                    className="h-full w-full"
                    resizeMode="cover"
                  />
                ) : (
                  <Text className="text-[20px] font-semibold text-ink">
                    {(profile.name.charAt(0) || "U").toUpperCase()}
                  </Text>
                )}
              </View>
              <Text className="mt-4 text-[25px] font-semibold tracking-[-0.03em] text-ink">
                {profile.name}
              </Text>
              <Text className="mt-1 text-[13px] leading-[20px] text-muted">
                {profile.bio || "No bio yet."}
              </Text>
              {profile.location ? (
                <Text className="mt-2 text-[12px] text-muted">
                  {profile.location}
                </Text>
              ) : null}
            </Animated.View>

            <Animated.View
              className="mt-5 rounded-[20px] border border-hairline bg-surfaceMuted/75 px-4 py-4"
              entering={FadeInUp.delay(40).duration(240)}
            >
              <Text className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted">
                Why This Person
              </Text>
              <Text className="mt-3 text-[14px] leading-[22px] text-ink/90">
                {quickReason}
              </Text>
              {profile.context?.lastInteraction ? (
                <Text className="mt-2 text-[12px] text-muted">
                  {profile.context.lastInteraction}
                </Text>
              ) : null}
              {sharedTopics.length > 0 ? (
                <View className="mt-3 flex-row flex-wrap gap-2">
                  {sharedTopics.map((topic) => (
                    <Chip key={topic} label={topic} />
                  ))}
                </View>
              ) : (
                <Text className="mt-2 text-[12px] text-muted">
                  No shared topics yet.
                </Text>
              )}
            </Animated.View>

            <Animated.View
              entering={FadeInUp.delay(60).duration(220)}
              className="mt-4"
            >
              {context.source === "request" ? (
                <View className="flex-row gap-2">
                  <View className="flex-1">
                    <PrimaryButton
                      label="Decline"
                      onPress={() => {
                        hapticImpact();
                        onDeclineRequest?.();
                        onClose();
                      }}
                      variant="ghost"
                    />
                  </View>
                  <View className="flex-1">
                    <PrimaryButton
                      label="Accept"
                      onPress={() => {
                        hapticImpact();
                        onAcceptRequest?.();
                        onClose();
                      }}
                    />
                  </View>
                </View>
              ) : (
                <View className="flex-row gap-2">
                  <View className="flex-1">
                    <PrimaryButton
                      label="Talk again"
                      onPress={() => {
                        hapticImpact();
                        onStartConversation?.();
                        onClose();
                      }}
                      variant="secondary"
                    />
                  </View>
                  <View className="flex-1">
                    <PrimaryButton
                      label="Start new"
                      onPress={() => {
                        hapticImpact();
                        onClose();
                      }}
                    />
                  </View>
                </View>
              )}
            </Animated.View>

            <Animated.View
              className="mt-5"
              entering={FadeInUp.delay(80).duration(240)}
            >
              <Text className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted">
                Interests
              </Text>
              {sharedTopics.length > 0 ? (
                <>
                  <Text className="mt-3 text-[12px] uppercase tracking-[0.11em] text-muted">
                    Shared
                  </Text>
                  <View className="mt-2 flex-row flex-wrap gap-2">
                    {sharedTopics.map((topic) => (
                      <Chip key={topic} label={topic} />
                    ))}
                  </View>
                </>
              ) : null}
              <Text className="mt-3 text-[12px] uppercase tracking-[0.11em] text-muted">
                {sharedTopics.length > 0 ? "Other interests" : "Topics"}
              </Text>
              <View className="mt-2 flex-row flex-wrap gap-2">
                {(sharedTopics.length > 0 ? otherInterests : allInterests)
                  .length > 0 ? (
                  (sharedTopics.length > 0 ? otherInterests : allInterests).map(
                    (interest) => <Chip key={interest} label={interest} />,
                  )
                ) : (
                  <Text className="text-[13px] text-muted">
                    Interests are still being inferred.
                  </Text>
                )}
              </View>
            </Animated.View>

            <Animated.View
              className="mt-5"
              entering={FadeInUp.delay(120).duration(240)}
            >
              <Text className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted">
                How They Connect
              </Text>
              <View className="mt-3 gap-2">
                <Text className="text-[13px] text-ink/90">
                  Format: {profile.preferences.format || "Not specified"}
                </Text>
                <Text className="text-[13px] text-ink/90">
                  Mode: {profile.preferences.mode || "Social"}
                </Text>
                <Text className="text-[13px] text-ink/90">
                  Availability: {profile.preferences.availability || "Unknown"}
                </Text>
              </View>
              <View className="mt-4 h-px bg-hairline/70" />
            </Animated.View>

            {profile.persona ? (
              <Animated.View
                className="mt-5 rounded-[18px] border border-hairline bg-surfaceMuted/75 px-4 py-4"
                entering={FadeInUp.delay(160).duration(240)}
              >
                <Text className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted">
                  Persona
                </Text>
                <Text className="mt-3 text-[17px] font-semibold text-ink">
                  {profile.persona}
                </Text>
                <Text className="mt-1 text-[13px] leading-[20px] text-muted">
                  A lightweight style summary inferred from interaction signals.
                </Text>
              </Animated.View>
            ) : null}

            <Animated.View
              className="mt-5"
              entering={FadeInUp.delay(200).duration(240)}
            >
              <Text className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted">
                Relationship Context
              </Text>
              <Text className="mt-3 text-[13px] leading-[20px] text-ink/90">
                {profile.context?.lastInteraction ||
                  "No previous interactions yet."}
              </Text>
              <View className="mt-4 h-px bg-hairline/70" />
            </Animated.View>

            {error ? (
              <Text
                className="mt-3 text-[12px]"
                style={{ color: appTheme.colors.danger }}
              >
                {error}
              </Text>
            ) : null}
          </>
        )}
      </ScrollView>

      <View className="border-t border-hairline bg-canvas/95 px-5 pb-7 pt-3">
        <View className="mt-2 flex-row gap-2">
          <View className="flex-1">
            <PrimaryButton
              disabled={busyAction !== null}
              label={busyAction === "report" ? "Reporting..." : "Report"}
              onPress={() => {
                void runModerationAction("report");
              }}
              variant="ghost"
            />
          </View>
          <View className="flex-1">
            <PrimaryButton
              disabled={busyAction !== null}
              label={busyAction === "block" ? "Blocking..." : "Block"}
              onPress={() => {
                void runModerationAction("block");
              }}
              variant="ghost"
            />
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}
