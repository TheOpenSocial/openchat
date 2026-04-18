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
import { useSavedSearches } from "../features/tasks/hooks/useSavedSearches";
import { hapticSelection } from "../lib/haptics";
import { appTheme } from "../theme";

type SavedSearchesScreenProps = {
  accessToken: string;
  onClose: () => void;
  userId: string;
};

export function SavedSearchesScreen({
  accessToken,
  onClose,
  userId,
}: SavedSearchesScreenProps) {
  const {
    deletingSearchId,
    error,
    items,
    loading,
    refresh,
    refreshing,
    remove,
  } = useSavedSearches({
    accessToken,
    userId,
  });

  if (loading) {
    return <LoadingState label="Loading saved searches" />;
  }

  return (
    <OperationScreenShell
      closeAccessibilityLabel="Close saved searches"
      closeTestID="saved-searches-close"
      eyebrow="Saved searches"
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
      subtitle="Reusable discovery filters for the people, plans, and signals you want to revisit."
      title="Reusable discovery filters"
    >
      {error ? <InlineNotice text={error} tone="error" /> : null}

      <View className="mb-4 rounded-[28px] border border-white/8 bg-white/[0.03] px-5 py-5">
        <Text className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/34">
          Overview
        </Text>
        <Text className="mt-3 text-[20px] font-semibold tracking-[-0.04em] text-white">
          Keep useful searches close at hand
        </Text>
        <Text className="mt-3 text-[14px] leading-[21px] text-white/58">
          Save the patterns that matter so you can come back to them quickly or
          turn them into lightweight follow-up routines later.
        </Text>
        <View className="mt-4">
          <PrimaryButton
            label={refreshing ? "Refreshing..." : "Refresh saved searches"}
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
                {item.meta}
              </Text>
              <Text className="mt-2 text-[17px] font-semibold tracking-[-0.03em] text-white/94">
                {item.title}
              </Text>
              <Text className="mt-2 text-[14px] leading-[20px] text-white/58">
                {item.subtitle}
              </Text>
              <Text className="mt-2 text-[13px] leading-[19px] text-white/44">
                {item.querySummary}
              </Text>
              <View className="mt-4 flex-row justify-end">
                <Pressable
                  className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2.5"
                  disabled={deletingSearchId === item.id}
                  onPress={() => {
                    hapticSelection();
                    void remove(item.id);
                  }}
                  style={({ pressed }) => ({
                    opacity: pressed || deletingSearchId === item.id ? 0.88 : 1,
                  })}
                >
                  {deletingSearchId === item.id ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text className="text-[12px] font-semibold uppercase tracking-[0.12em] text-white/78">
                      Delete
                    </Text>
                  )}
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      ) : (
        <EmptyState
          description="As you save more filters, they’ll appear here so you can reopen them without rebuilding the same search."
          title="No saved searches"
        />
      )}
    </OperationScreenShell>
  );
}
