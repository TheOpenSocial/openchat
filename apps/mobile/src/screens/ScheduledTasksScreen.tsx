import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";

import { EmptyState } from "../components/EmptyState";
import { InlineNotice } from "../components/InlineNotice";
import { LoadingState } from "../components/LoadingState";
import { OperationScreenShell } from "../components/OperationScreenShell";
import { PrimaryButton } from "../components/PrimaryButton";
import { useScheduledTasks } from "../features/tasks/hooks/useScheduledTasks";
import { hapticSelection } from "../lib/haptics";
import { appTheme } from "../theme";

type ScheduledTasksScreenProps = {
  accessToken: string;
  onClose: () => void;
  userId: string;
};

export function ScheduledTasksScreen({
  accessToken,
  onClose,
  userId,
}: ScheduledTasksScreenProps) {
  const {
    actingTaskId,
    archive,
    error,
    items,
    loading,
    pause,
    refresh,
    refreshing,
    resume,
    runNow,
  } = useScheduledTasks({
    accessToken,
    userId,
  });

  if (loading) {
    return <LoadingState label="Loading scheduled tasks" />;
  }

  return (
    <OperationScreenShell
      closeAccessibilityLabel="Close scheduled tasks"
      closeTestID="scheduled-tasks-close"
      eyebrow="Scheduled tasks"
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
      screenTestID="scheduled-tasks-screen"
      subtitle="Recurring follow-ups, reminders, and digest jobs that keep your momentum going."
      title="Automated follow-up jobs"
    >
      {error ? <InlineNotice text={error} tone="error" /> : null}

      <View className="mb-4 rounded-[28px] border border-white/8 bg-white/[0.03] px-5 py-5">
        <Text className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/34">
          Overview
        </Text>
        <Text className="mt-3 text-[20px] font-semibold tracking-[-0.04em] text-white">
          Keep recurring jobs under control
        </Text>
        <Text className="mt-3 text-[14px] leading-[21px] text-white/58">
          Review what is scheduled, run it now when timing matters, or pause it
          when you want less noise.
        </Text>
        <View className="mt-4">
          <PrimaryButton
            label={refreshing ? "Refreshing..." : "Refresh tasks"}
            onPress={() => {
              void refresh();
            }}
            variant="secondary"
          />
        </View>
      </View>

      {items.length > 0 ? (
        <View className="gap-3">
          {items.map((item) => (
            <View
              className="rounded-[28px] border border-white/8 bg-white/[0.03] px-4 py-4"
              key={item.id}
            >
              <Text className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/34">
                {item.taskType}
              </Text>
              <Text className="mt-2 text-[17px] font-semibold tracking-[-0.03em] text-white/94">
                {item.title}
              </Text>
              <Text className="mt-2 text-[14px] leading-[20px] text-white/58">
                {item.subtitle}
              </Text>
              <Text className="mt-2 text-[13px] leading-[19px] text-white/44">
                {item.scheduleLabel}
              </Text>
              <Text className="mt-1 text-[13px] leading-[19px] text-white/40">
                Status: {item.status} · Next run:{" "}
                {item.nextRunAt ?? "Not scheduled"} · Last run:{" "}
                {item.lastRunAt ?? "Never"}
              </Text>
              <View className="mt-4 gap-2">
                <View className="flex-row gap-2">
                  <Pressable
                    className="flex-1 items-center justify-center rounded-full bg-white px-4 py-3"
                    disabled={actingTaskId === item.id}
                    onPress={() => {
                      hapticSelection();
                      void runNow(item.id);
                    }}
                    style={({ pressed }) => ({
                      opacity: pressed || actingTaskId === item.id ? 0.88 : 1,
                    })}
                  >
                    {actingTaskId === item.id ? (
                      <ActivityIndicator color="#050506" />
                    ) : (
                      <Text className="text-[13px] font-semibold text-[#050506]">
                        Run now
                      </Text>
                    )}
                  </Pressable>
                  <Pressable
                    className="flex-1 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-4 py-3"
                    disabled={actingTaskId === item.id}
                    onPress={() => {
                      hapticSelection();
                      if (item.status === "paused") {
                        void resume(item.id);
                        return;
                      }
                      void pause(item.id);
                    }}
                    style={({ pressed }) => ({
                      opacity: pressed || actingTaskId === item.id ? 0.88 : 1,
                    })}
                  >
                    <Text className="text-[13px] font-semibold text-white/82">
                      {item.status === "paused" ? "Resume" : "Pause"}
                    </Text>
                  </Pressable>
                </View>
                <Pressable
                  className="items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-4 py-3"
                  disabled={actingTaskId === item.id}
                  onPress={() => {
                    hapticSelection();
                    void archive(item.id);
                  }}
                  style={({ pressed }) => ({
                    opacity: pressed || actingTaskId === item.id ? 0.88 : 1,
                  })}
                >
                  <Text className="text-[13px] font-semibold text-white/70">
                    Archive
                  </Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      ) : (
        <EmptyState
          description="When you start using recurring follow-ups, they’ll appear here with their next run and quick controls."
          title="No scheduled tasks"
        />
      )}
    </OperationScreenShell>
  );
}
