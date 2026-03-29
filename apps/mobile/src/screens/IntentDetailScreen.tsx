import Ionicons from "@expo/vector-icons/Ionicons";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { InlineNotice } from "../components/InlineNotice";
import { PrimaryButton } from "../components/PrimaryButton";
import { useIntentStatus } from "../features/intents/hooks/useIntentStatus";
import { hapticSelection } from "../lib/haptics";
import { appTheme } from "../theme";

type IntentDetailScreenProps = {
  accessToken: string;
  intentId: string;
  onClose: () => void;
  userId: string;
};

export function IntentDetailScreen({
  accessToken,
  intentId,
  onClose,
  userId,
}: IntentDetailScreenProps) {
  const {
    acting,
    canCancel,
    canRetry,
    canWiden,
    error,
    loading,
    refresh,
    runAction,
    statusDescription,
    statusLabel,
    viewModel,
  } = useIntentStatus({
    accessToken,
    intentId,
    userId,
  });

  return (
    <SafeAreaView className="flex-1 bg-canvas" style={{ flex: 1 }}>
      <View className="flex-1 bg-canvas" style={{ flex: 1 }}>
        <View className="flex-row items-start justify-between px-5 pb-5 pt-3">
          <View className="max-w-[280px] gap-2">
            <Text className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
              Intent detail
            </Text>
            <Text className="text-[34px] font-semibold tracking-[-0.05em] text-ink">
              Track your ask
            </Text>
            <Text className="text-[14px] leading-[21px] text-muted">
              Review current status, why the system sees it this way, and what
              to do next.
            </Text>
          </View>
          <Pressable
            accessibilityLabel="Close intent detail"
            accessibilityRole="button"
            className="mt-1 h-10 w-10 items-center justify-center rounded-full border border-hairline bg-surfaceMuted/75"
            onPress={() => {
              hapticSelection();
              onClose();
            }}
            style={({ pressed }) => ({ opacity: pressed ? 0.88 : 1 })}
            testID="intent-detail-close"
          >
            <Ionicons color={appTheme.colors.ink} name="close" size={18} />
          </Pressable>
        </View>

        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 40, paddingHorizontal: 20 }}
          showsVerticalScrollIndicator={false}
        >
          {error ? <InlineNotice text={error} tone="error" /> : null}

          {loading || !viewModel ? (
            <View className="items-center justify-center py-20">
              <ActivityIndicator color={appTheme.colors.ink} />
              <Text className="mt-4 text-[14px] text-muted">
                Loading intent details
              </Text>
            </View>
          ) : (
            <>
              <View className="mb-4 rounded-[28px] border border-hairline bg-surfaceMuted/85 px-5 py-5">
                <View className="flex-row items-center gap-2">
                  <View className="rounded-full border border-hairline bg-surfaceMuted/75 px-3 py-1">
                    <Text className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink">
                      {statusLabel}
                    </Text>
                  </View>
                  <Text className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                    Intent status
                  </Text>
                </View>
                <Text className="mt-3 text-[22px] font-semibold tracking-[-0.04em] text-ink">
                  {viewModel.rawText}
                </Text>
                <Text className="mt-3 text-[14px] leading-[21px] text-muted">
                  {statusDescription}
                </Text>
                <Text className="mt-4 text-[13px] leading-[20px] text-muted">
                  {viewModel.requestsLabel}
                </Text>
                <Text className="mt-3 text-[14px] leading-[21px] text-muted">
                  {viewModel.summary}
                </Text>
              </View>

              <View className="mb-4 rounded-[28px] border border-hairline bg-surfaceMuted/85 px-5 py-5">
                <Text className="text-[16px] font-semibold tracking-[-0.03em] text-ink">
                  Current framing
                </Text>
                <Text className="mt-3 text-[14px] leading-[21px] text-muted">
                  {viewModel.body}
                </Text>
              </View>

              <View className="mb-6 rounded-[28px] border border-hairline bg-surfaceMuted/85 px-5 py-5">
                <Text className="text-[16px] font-semibold tracking-[-0.03em] text-ink">
                  Why this status
                </Text>
                <View className="mt-3 gap-3">
                  {viewModel.factors.length > 0 ? (
                    viewModel.factors.map((factor) => (
                      <View
                        className="rounded-2xl border border-hairline bg-surfaceMuted/75 px-4 py-3"
                        key={factor}
                      >
                        <Text className="text-[14px] leading-[21px] text-muted">
                          {factor}
                        </Text>
                      </View>
                    ))
                  ) : (
                    <Text className="text-[14px] leading-[21px] text-muted">
                      No extra explanation is available yet.
                    </Text>
                  )}
                </View>
              </View>

              <View className="gap-3">
                <PrimaryButton
                  disabled={!canRetry}
                  label={
                    !canRetry
                      ? "Retry unavailable"
                      : acting === "retry"
                        ? "Retrying..."
                        : "Retry intent"
                  }
                  onPress={() => {
                    void runAction("retry");
                  }}
                  variant="primary"
                />
                <PrimaryButton
                  disabled={!canWiden}
                  label={
                    !canWiden
                      ? "Widen unavailable"
                      : acting === "widen"
                        ? "Widening..."
                        : "Widen filters"
                  }
                  onPress={() => {
                    void runAction("widen");
                  }}
                  variant="secondary"
                />
                <PrimaryButton
                  disabled={!canCancel}
                  label={
                    !canCancel
                      ? "Already cancelled"
                      : acting === "cancel"
                        ? "Cancelling..."
                        : "Cancel intent"
                  }
                  onPress={() => {
                    void runAction("cancel");
                  }}
                  variant="ghost"
                />
                <PrimaryButton
                  disabled={acting != null}
                  label={acting == null ? "Refresh" : "Working..."}
                  onPress={() => {
                    void refresh();
                  }}
                  variant="ghost"
                />
              </View>
            </>
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
