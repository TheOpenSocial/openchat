import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { EmptyState } from "../components/EmptyState";
import { InlineNotice } from "../components/InlineNotice";
import { OperationScreenShell } from "../components/OperationScreenShell";
import { SectionHeader } from "../components/SectionHeader";
import { CircleRow } from "../features/recurring/components/CircleRow";
import { CircleSessionRow } from "../features/recurring/components/CircleSessionRow";
import { useRecurringCircles } from "../features/recurring/hooks/useRecurringCircles";
import { hapticSelection } from "../lib/haptics";
import { appTheme } from "../theme";

type RecurringCirclesScreenProps = {
  accessToken: string;
  onClose: () => void;
  userId: string;
};

export function RecurringCirclesScreen({
  accessToken,
  onClose,
  userId,
}: RecurringCirclesScreenProps) {
  const { actingCircleId, error, items, loading, refresh, refreshing, runNow } =
    useRecurringCircles({
      accessToken,
      userId,
    });

  return (
    <OperationScreenShell
      closeAccessibilityLabel="Close recurring circles"
      closeTestID="recurring-circles-close"
      eyebrow="Recurring circles"
      onClose={() => {
        hapticSelection();
        onClose();
      }}
      subtitle="Your repeating groups, upcoming sessions, and the rhythm they create over time."
      title="Your repeating groups"
    >
      {error ? <InlineNotice text={error} tone="error" /> : null}

      <View className="mb-4">
        <Pressable
          className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-3"
          onPress={() => {
            void refresh();
          }}
          style={({ pressed }) => ({
            opacity: pressed || refreshing ? 0.88 : 1,
          })}
        >
          <Text className="text-center text-[13px] font-semibold tracking-[-0.01em] text-ink">
            {refreshing ? "Refreshing..." : "Refresh circles"}
          </Text>
        </Pressable>
      </View>

      {loading ? (
        <View className="items-center justify-center py-20">
          <ActivityIndicator color={appTheme.colors.ink} />
          <Text className="mt-4 text-[14px] text-muted">Loading circles</Text>
        </View>
      ) : items.length > 0 ? (
        <View className="gap-6">
          {items.map((circle) => (
            <View key={circle.id}>
              <SectionHeader
                description={circle.description ?? undefined}
                title={circle.title}
              />
              <CircleRow
                acting={actingCircleId === circle.id}
                item={circle}
                onRunNow={(circleId) => {
                  hapticSelection();
                  void runNow(circleId);
                }}
              />

              <View className="mt-4 gap-3">
                <Text className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/34">
                  Sessions
                </Text>
                {circle.sessions.length > 0 ? (
                  circle.sessions.map((session) => (
                    <CircleSessionRow key={session.id} session={session} />
                  ))
                ) : (
                  <View className="rounded-[22px] border border-hairline bg-surfaceMuted/70 px-4 py-4">
                    <Text className="text-[14px] leading-[20px] text-muted">
                      No sessions have run yet.
                    </Text>
                  </View>
                )}
              </View>
            </View>
          ))}
        </View>
      ) : (
        <EmptyState
          description="When you start a repeating group, it’ll appear here with its next session and recent history."
          title="No recurring circles yet"
        />
      )}
    </OperationScreenShell>
  );
}
