import { useMemo } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";

import { InlineNotice } from "../components/InlineNotice";
import { OperationScreenShell } from "../components/OperationScreenShell";
import { useActivityFeed } from "../features/activity/hooks/useActivityFeed";
import { ActivityRow } from "../features/activity/components/ActivityRow";
import { hapticSelection } from "../lib/haptics";
import { appTheme } from "../theme";

type ActivityScreenProps = {
  accessToken: string;
  onClose?: () => void;
  onOpenConnections?: () => void;
  onOpenDiscovery?: () => void;
  onOpenInbox?: () => void;
  onOpenIntentDetail?: (intentId: string) => void;
  onOpenRecurringCircles?: () => void;
  onOpenSavedSearches?: () => void;
  onOpenScheduledTasks?: () => void;
  userId: string;
};

export function ActivityScreen({
  accessToken,
  onClose,
  onOpenConnections,
  onOpenDiscovery,
  onOpenInbox,
  onOpenIntentDetail,
  onOpenRecurringCircles,
  onOpenSavedSearches,
  onOpenScheduledTasks,
  userId,
}: ActivityScreenProps) {
  const {
    error,
    items,
    loading,
    pendingRequestCount,
    refresh,
    refreshing,
    sections,
  } = useActivityFeed({
    accessToken,
    userId,
  });

  const headerSubtitle = useMemo(() => {
    if (pendingRequestCount > 0) {
      return `${pendingRequestCount} request${pendingRequestCount === 1 ? "" : "s"} need a response now`;
    }
    return "Requests, discovery signals, and system updates";
  }, [pendingRequestCount]);
  const topSection = sections[0] ?? null;
  const utilityActions = [
    {
      id: "inbox",
      label: "Inbox",
      onPress: onOpenInbox,
      testID: "activity-open-inbox",
    },
    {
      id: "connections",
      label: "Connections",
      onPress: onOpenConnections,
      testID: "activity-open-connections",
    },
    {
      id: "discovery",
      label: "Discovery",
      onPress: onOpenDiscovery,
      testID: "activity-open-discovery",
    },
    {
      id: "circles",
      label: "Circles",
      onPress: onOpenRecurringCircles,
      testID: "activity-open-recurring-circles",
    },
    {
      id: "searches",
      label: "Searches",
      onPress: onOpenSavedSearches,
      testID: "activity-open-saved-searches",
    },
    {
      id: "tasks",
      label: "Tasks",
      onPress: onOpenScheduledTasks,
      testID: "activity-open-scheduled-tasks",
    },
  ];

  const quickLinks = (
    <View className="gap-3 pt-1">
      <Text
        className="text-[10px] font-semibold uppercase tracking-[0.14em]"
        style={{ color: appTheme.colors.inkFaint }}
      >
        Quick links
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {utilityActions.map((action) => (
          <Pressable
            accessibilityLabel={`Open ${action.label.toLowerCase()}`}
            accessibilityRole="button"
            className="min-h-11 rounded-full border bg-surfaceMuted px-4 py-3"
            key={action.id}
            onPress={() => {
              hapticSelection();
              action.onPress?.();
            }}
            style={({ pressed }) => ({
              borderColor: appTheme.colors.hairline,
              opacity: pressed ? appTheme.motion.pressOpacity : 1,
            })}
            testID={action.testID}
          >
            <Text
              className="text-[13px] font-semibold tracking-[-0.01em]"
              style={{ color: appTheme.colors.inkSoft }}
            >
              {action.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  return (
    <OperationScreenShell
      closeAccessibilityLabel={onClose ? "Close activity" : undefined}
      closeTestID={onClose ? "activity-close" : undefined}
      eyebrow="Activity"
      onClose={
        onClose
          ? () => {
              hapticSelection();
              onClose();
            }
          : undefined
      }
      screenTestID="activity-screen"
      scrollProps={{
        refreshControl: (
          <RefreshControl
            onRefresh={() => {
              void refresh();
            }}
            colors={[appTheme.colors.ink]}
            refreshing={refreshing}
            tintColor={appTheme.colors.ink}
          />
        ),
      }}
      subtitle={topSection?.subtitle ?? headerSubtitle}
      title="What needs your attention"
    >
      {topSection?.emphasis === "urgent" ? (
        <View
          className="mb-5 rounded-[24px] border bg-surface px-4 py-4"
          style={{ borderColor: appTheme.colors.hairlineStrong }}
        >
          <Text
            className="text-[10px] font-semibold uppercase tracking-[0.14em]"
            style={{ color: appTheme.colors.inkFaint }}
          >
            Live priority
          </Text>
          <Text
            className="mt-2 text-[17px] font-semibold tracking-[-0.03em]"
            style={{ color: appTheme.colors.ink }}
          >
            Start with the items that need a reply now
          </Text>
          <Text
            className="mt-3 text-[13px] leading-[20px]"
            style={{ color: appTheme.colors.inkMuted }}
          >
            {topSection.subtitle}
          </Text>
        </View>
      ) : null}

      {error ? <InlineNotice text={error} tone="error" /> : null}

      {loading ? (
        <View className="items-center justify-center py-20">
          <ActivityIndicator color={appTheme.colors.ink} />
          <Text className="mt-4 text-[14px] text-muted">Loading activity</Text>
        </View>
      ) : items.length > 0 ? (
        <View className="gap-7">
          {sections.map((section) => (
            <View
              className="gap-3"
              key={section.id}
              testID={`activity-section-${section.id}`}
            >
              <View className="gap-2">
                <View className="flex-row items-center justify-between gap-3">
                  <Text
                    className="text-[11px] font-semibold uppercase tracking-[0.14em]"
                    style={{ color: appTheme.colors.inkFaint }}
                  >
                    {section.title}
                  </Text>
                  <View
                    className="min-h-8 rounded-full border px-2.5 py-1.5"
                    style={{
                      backgroundColor:
                        section.emphasis === "urgent"
                          ? appTheme.colors.panel
                          : section.emphasis === "active"
                            ? appTheme.colors.panelMuted
                            : appTheme.colors.panelSoft,
                      borderColor:
                        section.emphasis === "urgent"
                          ? appTheme.colors.hairlineStrong
                          : appTheme.colors.hairline,
                    }}
                  >
                    <Text
                      className="text-[10px] font-semibold uppercase tracking-[0.12em]"
                      style={{
                        color:
                          section.emphasis === "urgent"
                            ? appTheme.colors.inkSoft
                            : section.emphasis === "active"
                              ? appTheme.colors.inkMuted
                              : appTheme.colors.inkFaint,
                      }}
                    >
                      {section.emphasis === "urgent"
                        ? "Now"
                        : section.emphasis === "active"
                          ? "In motion"
                          : "Ambient"}
                    </Text>
                  </View>
                </View>
                <Text
                  className="text-[13px] leading-[19px]"
                  style={{ color: appTheme.colors.inkMuted }}
                >
                  {section.subtitle}
                </Text>
              </View>
              {section.items.map((item) => (
                <ActivityRow
                  item={item}
                  key={item.id}
                  onPress={(pressedItem) => {
                    if (pressedItem.kind === "request") {
                      if (pressedItem.intentId) {
                        hapticSelection();
                        onOpenIntentDetail?.(pressedItem.intentId);
                      }
                    }
                    if (pressedItem.kind === "intent") {
                      hapticSelection();
                      onOpenIntentDetail?.(pressedItem.intentId);
                    }
                  }}
                />
              ))}
            </View>
          ))}
          {quickLinks}
        </View>
      ) : (
        <View className="gap-5">
          <View className="rounded-[28px] border border-white/8 bg-white/[0.03] px-5 py-6">
            <Text className="text-[18px] font-semibold tracking-[-0.03em] text-white/94">
              You are clear for now
            </Text>
            <Text className="mt-2 text-[14px] leading-[21px] text-white/56">
              New requests, discovery nudges, and system updates will appear
              here.
            </Text>
          </View>
          {quickLinks}
        </View>
      )}
    </OperationScreenShell>
  );
}
