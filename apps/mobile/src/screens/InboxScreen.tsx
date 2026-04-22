import { useMemo } from "react";
import { ActivityIndicator, RefreshControl, Text, View } from "react-native";

import { AgentBriefingCard } from "../components/AgentBriefingCard";
import { InlineNotice } from "../components/InlineNotice";
import { OperationScreenShell } from "../components/OperationScreenShell";
import { RequestRow } from "../features/inbox/components/RequestRow";
import { useInboxRequests } from "../features/inbox/hooks/useInboxRequests";
import { hapticSelection } from "../lib/haptics";
import { appTheme } from "../theme";

type InboxScreenProps = {
  accessToken: string;
  onClose: () => void;
  onOpenIntentDetail?: (intentId: string) => void;
  onOpenProfile?: (targetUserId: string) => void;
  userId: string;
};

export function InboxScreen({
  accessToken,
  onClose,
  onOpenIntentDetail,
  onOpenProfile,
  userId,
}: InboxScreenProps) {
  const {
    accept,
    actingRequestId,
    error,
    loading,
    refresh,
    refreshing,
    reject,
    requests,
  } = useInboxRequests({
    accessToken,
    userId,
  });

  const agentBrief = useMemo(() => {
    if (loading) {
      return null;
    }

    if (requests.length === 0) {
      return {
        body: "You are clear right now. I will surface new connection requests here as soon as they need a response.",
        title: "No one is waiting on you",
      };
    }

    if (requests.length === 1) {
      return {
        body: "You have one open request. A quick yes or no will keep the thread moving and unblock the other person.",
        title: "One reply needs your call",
      };
    }

    return {
      body: `${requests.length} requests are waiting. I would start with the most recent one, then clear the rest in one pass so nothing stalls.`,
      title: `${requests.length} replies are stacked up`,
    };
  }, [loading, requests.length]);

  return (
    <OperationScreenShell
      closeAccessibilityLabel="Close inbox"
      closeTestID="inbox-close"
      eyebrow="Inbox"
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
      screenTestID="inbox-screen"
      subtitle="Accept or decline connection requests without leaving the app flow."
      title="Requests waiting on you"
    >
      {agentBrief ? (
        <AgentBriefingCard
          body={agentBrief.body}
          eyebrow="Agent brief"
          title={agentBrief.title}
        />
      ) : null}

      {error ? <InlineNotice text={error} tone="error" /> : null}

      {loading ? (
        <View className="items-center justify-center py-20">
          <ActivityIndicator color={appTheme.colors.ink} />
          <Text className="mt-4 text-[14px] text-muted">Loading inbox</Text>
        </View>
      ) : requests.length > 0 ? (
        <View className="gap-3">
          {requests.map((request) => (
            <RequestRow
              acting={actingRequestId === request.id}
              key={request.id}
              onAccept={() => {
                void accept(request.id);
              }}
              onOpenIntentDetail={(intentId) => {
                hapticSelection();
                onOpenIntentDetail?.(intentId);
              }}
              onOpenProfile={(targetUserId) => {
                hapticSelection();
                onOpenProfile?.(targetUserId);
              }}
              onReject={() => {
                void reject(request.id);
              }}
              request={request}
            />
          ))}
        </View>
      ) : (
        <View className="rounded-[28px] border border-white/8 bg-white/[0.03] px-5 py-6">
          <Text className="text-[18px] font-semibold tracking-[-0.03em] text-white/94">
            Inbox is clear
          </Text>
          <Text className="mt-2 text-[14px] leading-[21px] text-white/56">
            New connection requests will appear here.
          </Text>
        </View>
      )}
    </OperationScreenShell>
  );
}
