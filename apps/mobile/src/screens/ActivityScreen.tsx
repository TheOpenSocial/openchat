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
  onClose: () => void;
  onOpenConnections?: () => void;
  onOpenInbox?: () => void;
  onOpenDiscovery?: () => void;
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
  const { error, items, loading, pendingRequestCount, refresh, refreshing } =
    useActivityFeed({
      accessToken,
      userId,
    });

  const headerSubtitle = useMemo(() => {
    if (pendingRequestCount > 0) {
      return `${pendingRequestCount} request${pendingRequestCount === 1 ? "" : "s"} waiting`;
    }
    return "Requests, discovery signals, and system updates";
  }, [pendingRequestCount]);

  return (
    <OperationScreenShell
      closeAccessibilityLabel="Close activity"
      closeTestID="activity-close"
      eyebrow="Activity"
      onClose={() => {
        hapticSelection();
        onClose();
      }}
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
      subtitle={headerSubtitle}
      title="What needs your attention"
    >
      <View className="flex-row gap-2 pb-4">
        <Pressable
          accessibilityLabel="Open connections"
          accessibilityRole="button"
          className="flex-1 rounded-full border border-white/10 bg-white/[0.04] px-4 py-3"
          hitSlop={8}
          onPress={() => {
            hapticSelection();
            onOpenConnections?.();
          }}
          style={({ pressed }) => ({
            opacity: pressed ? appTheme.motion.pressOpacity : 1,
          })}
          testID="activity-open-connections"
        >
          <Text className="text-center text-[13px] font-semibold tracking-[-0.01em] text-white/84">
            Connections
          </Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Open discovery"
          accessibilityRole="button"
          className="flex-1 rounded-full border border-white/10 bg-white/[0.04] px-4 py-3"
          hitSlop={8}
          onPress={() => {
            hapticSelection();
            onOpenDiscovery?.();
          }}
          style={({ pressed }) => ({
            opacity: pressed ? appTheme.motion.pressOpacity : 1,
          })}
          testID="activity-open-discovery"
        >
          <Text className="text-center text-[13px] font-semibold tracking-[-0.01em] text-white/84">
            Discovery
          </Text>
        </Pressable>
      </View>

      <View className="flex-row gap-2 pb-4">
        <Pressable
          accessibilityLabel="Open recurring circles"
          accessibilityRole="button"
          className="flex-1 rounded-full border border-white/10 bg-white/[0.04] px-4 py-3"
          hitSlop={8}
          onPress={() => {
            hapticSelection();
            onOpenRecurringCircles?.();
          }}
          style={({ pressed }) => ({
            opacity: pressed ? appTheme.motion.pressOpacity : 1,
          })}
          testID="activity-open-recurring-circles"
        >
          <Text className="text-center text-[13px] font-semibold tracking-[-0.01em] text-white/84">
            Circles
          </Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Open saved searches"
          accessibilityRole="button"
          className="flex-1 rounded-full border border-white/10 bg-white/[0.04] px-4 py-3"
          hitSlop={8}
          onPress={() => {
            hapticSelection();
            onOpenSavedSearches?.();
          }}
          style={({ pressed }) => ({
            opacity: pressed ? appTheme.motion.pressOpacity : 1,
          })}
          testID="activity-open-saved-searches"
        >
          <Text className="text-center text-[13px] font-semibold tracking-[-0.01em] text-white/84">
            Searches
          </Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Open scheduled tasks"
          accessibilityRole="button"
          className="flex-1 rounded-full border border-white/10 bg-white/[0.04] px-4 py-3"
          hitSlop={8}
          onPress={() => {
            hapticSelection();
            onOpenScheduledTasks?.();
          }}
          style={({ pressed }) => ({
            opacity: pressed ? appTheme.motion.pressOpacity : 1,
          })}
          testID="activity-open-scheduled-tasks"
        >
          <Text className="text-center text-[13px] font-semibold tracking-[-0.01em] text-white/84">
            Tasks
          </Text>
        </Pressable>
      </View>

      {error ? <InlineNotice text={error} tone="error" /> : null}

      {loading ? (
        <View className="items-center justify-center py-20">
          <ActivityIndicator color={appTheme.colors.ink} />
          <Text className="mt-4 text-[14px] text-muted">Loading activity</Text>
        </View>
      ) : items.length > 0 ? (
        <View className="gap-3">
          {items.map((item) => (
            <ActivityRow
              item={item}
              key={item.id}
              onPress={(pressedItem) => {
                if (pressedItem.kind === "request") {
                  hapticSelection();
                  onOpenInbox?.();
                }
                if (pressedItem.kind === "intent") {
                  hapticSelection();
                  onOpenIntentDetail?.(pressedItem.intentId);
                }
              }}
            />
          ))}
        </View>
      ) : (
        <View className="rounded-[28px] border border-white/8 bg-white/[0.03] px-5 py-6">
          <Text className="text-[18px] font-semibold tracking-[-0.03em] text-white/94">
            You are clear for now
          </Text>
          <Text className="mt-2 text-[14px] leading-[21px] text-white/56">
            New requests, discovery nudges, and system updates will appear here.
          </Text>
        </View>
      )}
    </OperationScreenShell>
  );
}
