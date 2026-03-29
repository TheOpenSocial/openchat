import { ActivityIndicator, RefreshControl, Text, View } from "react-native";

import { InlineNotice } from "../components/InlineNotice";
import { OperationScreenShell } from "../components/OperationScreenShell";
import { SectionHeader } from "../components/SectionHeader";
import { PrimaryButton } from "../components/PrimaryButton";
import { DiscoveryRow } from "../features/discovery/components/DiscoveryRow";
import { useActivationBootstrap } from "../features/discovery/hooks/useActivationBootstrap";
import { useDiscoveryFeed } from "../features/discovery/hooks/useDiscoveryFeed";
import { hapticSelection } from "../lib/haptics";
import { appTheme } from "../theme";

type DiscoveryScreenProps = {
  accessToken: string;
  onClose: () => void;
  onOpenProfile?: (targetUserId: string) => void;
  userId: string;
};

export function DiscoveryScreen({
  accessToken,
  onClose,
  onOpenProfile,
  userId,
}: DiscoveryScreenProps) {
  const { error, loading, refresh, refreshing, viewModel } = useDiscoveryFeed({
    accessToken,
    userId,
  });
  const {
    error: activationError,
    loading: activationLoading,
    refreshAll: refreshActivation,
    refreshBootstrap,
    refreshPlan,
    refreshingBootstrap,
    refreshingPlan,
    viewModel: activationViewModel,
  } = useActivationBootstrap({
    accessToken,
    userId,
  });

  return (
    <OperationScreenShell
      closeAccessibilityLabel="Close discovery"
      closeTestID="discovery-close"
      eyebrow="Discovery"
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
      subtitle="Passive discovery, inbox suggestions, and agent briefings in one place."
      title="Fresh places to go next"
    >
      {error ? <InlineNotice text={error} tone="error" /> : null}
      {activationError ? (
        <InlineNotice text={activationError} tone="error" />
      ) : null}

      <View className="mb-4 rounded-[28px] border border-white/8 bg-white/[0.03] px-5 py-5">
        <Text className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/34">
          Activation bootstrap
        </Text>
        {activationLoading && !activationViewModel ? (
          <View className="mt-4 flex-row items-center gap-3">
            <ActivityIndicator color={appTheme.colors.ink} />
            <Text className="text-[14px] text-muted">
              Loading activation state
            </Text>
          </View>
        ) : activationViewModel ? (
          <>
            <Text className="mt-3 text-[20px] font-semibold tracking-[-0.04em] text-white">
              {activationViewModel.summary}
            </Text>
            <Text className="mt-3 text-[14px] leading-[21px] text-white/58">
              {activationViewModel.onboardingStateLabel} ·{" "}
              {activationViewModel.activationStateLabel} ·{" "}
              {activationViewModel.executionStateLabel}
            </Text>
            <Text className="mt-2 text-[13px] leading-[20px] text-white/48">
              {activationViewModel.discoverySummary}
            </Text>
            <Text className="mt-2 text-[13px] leading-[20px] text-white/48">
              {activationViewModel.primaryThreadLabel}
            </Text>
            <View className="mt-4 rounded-[20px] border border-white/8 bg-white/[0.04] px-4 py-4">
              <Text className="text-[12px] font-semibold uppercase tracking-[0.14em] text-white/34">
                Recommended action
              </Text>
              <Text className="mt-2 text-[15px] font-semibold tracking-[-0.03em] text-white/92">
                {activationViewModel.recommendedActionLabel}
              </Text>
              <Text className="mt-2 text-[13px] leading-[20px] text-white/58">
                {activationViewModel.recommendedActionText}
              </Text>
            </View>
            {activationViewModel.planSnapshot ? (
              <View className="mt-3 rounded-[20px] border border-white/8 bg-white/[0.04] px-4 py-4">
                <Text className="text-[12px] font-semibold uppercase tracking-[0.14em] text-white/34">
                  Plan preview
                </Text>
                <Text className="mt-2 text-[15px] font-semibold tracking-[-0.03em] text-white/92">
                  {activationViewModel.planSnapshot.summary}
                </Text>
                <Text className="mt-2 text-[13px] leading-[20px] text-white/58">
                  {activationViewModel.planSnapshot.stateLabel} ·{" "}
                  {activationViewModel.planSnapshot.sourceLabel}
                </Text>
                <Text className="mt-2 text-[13px] leading-[20px] text-white/58">
                  {activationViewModel.planSnapshot.actionLabel}
                </Text>
                <Text className="mt-1 text-[13px] leading-[20px] text-white/48">
                  {activationViewModel.planSnapshot.actionText}
                </Text>
              </View>
            ) : null}
            <View className="mt-4 gap-3">
              <PrimaryButton
                disabled={refreshingBootstrap || refreshingPlan}
                label={
                  refreshingBootstrap || refreshingPlan
                    ? "Refreshing activation..."
                    : "Refresh activation"
                }
                onPress={() => {
                  void refreshActivation();
                }}
                variant="primary"
              />
              <PrimaryButton
                disabled={refreshingBootstrap}
                label={
                  refreshingBootstrap
                    ? "Refreshing bootstrap..."
                    : "Refresh bootstrap"
                }
                onPress={() => {
                  void refreshBootstrap();
                }}
                variant="secondary"
              />
              <PrimaryButton
                disabled={refreshingPlan}
                label={
                  refreshingPlan ? "Refreshing plan..." : "Regenerate plan"
                }
                onPress={() => {
                  void refreshPlan();
                }}
                variant="ghost"
              />
            </View>
          </>
        ) : null}
      </View>

      {loading ? (
        <View className="items-center justify-center py-20">
          <Text className="text-[14px] text-muted">Loading discovery</Text>
        </View>
      ) : (
        <>
          <View className="mb-4 rounded-[28px] border border-white/8 bg-white/[0.03] px-5 py-5">
            <Text className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/34">
              Briefing
            </Text>
            <Text className="mt-3 text-[20px] font-semibold tracking-[-0.04em] text-white">
              {viewModel.headline}
            </Text>
            {viewModel.briefing ? (
              <Text className="mt-3 text-[14px] leading-[21px] text-white/58">
                {viewModel.briefing}
              </Text>
            ) : null}
            <View className="mt-4">
              <PrimaryButton
                label={refreshing ? "Refreshing..." : "Refresh discovery"}
                onPress={() => {
                  void refresh();
                }}
                variant="secondary"
              />
            </View>
          </View>

          {viewModel.sections.length > 0 ? (
            viewModel.sections.map((section) => (
              <View className="mb-7" key={section.id}>
                <SectionHeader
                  description={section.description}
                  title={section.title}
                />
                <View className="gap-3">
                  {section.items.map((item) => (
                    <DiscoveryRow
                      key={item.id}
                      item={item}
                      onPress={(pressedItem) => {
                        if (pressedItem.targetUserId) {
                          hapticSelection();
                          onOpenProfile?.(pressedItem.targetUserId);
                        }
                      }}
                    />
                  ))}
                </View>
              </View>
            ))
          ) : (
            <View className="rounded-[28px] border border-white/8 bg-white/[0.03] px-5 py-6">
              <Text className="text-[18px] font-semibold tracking-[-0.03em] text-white/94">
                Nothing to surface yet
              </Text>
              <Text className="mt-2 text-[14px] leading-[21px] text-white/56">
                We will show people, groups, reconnects, and suggestions as they
                become available.
              </Text>
            </View>
          )}
        </>
      )}
    </OperationScreenShell>
  );
}
