import { ActivityIndicator, Pressable, Text, View } from "react-native";

import type { InboxRequestRecord } from "../../../lib/api";
import { appTheme } from "../../../theme";

export function RequestRow({
  acting,
  onAccept,
  onOpenIntentDetail,
  onOpenProfile,
  onReject,
  request,
}: {
  acting: boolean;
  onAccept: () => void;
  onOpenIntentDetail?: (intentId: string) => void;
  onOpenProfile?: (targetUserId: string) => void;
  onReject: () => void;
  request: InboxRequestRecord;
}) {
  const profileHint = "Opens the sender profile.";
  const intentHint = "Opens the request intent details.";
  const acceptHint = "Accepts this connection request.";
  const declineHint = "Declines this connection request.";

  return (
    <View className="rounded-[28px] border border-hairline bg-surfaceMuted/85 px-4 py-4">
      <Text className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
        Pending request
      </Text>
      <Text className="mt-2 text-[18px] font-semibold tracking-[-0.03em] text-ink">
        Someone wants to connect
      </Text>
      <Text className="mt-2 text-[14px] leading-[20px] text-muted">
        Intent ID: {request.intentId}
      </Text>
      <Text className="mt-1 text-[13px] text-muted">Wave {request.wave}</Text>

      <View className="mt-4 flex-row gap-3">
        <Pressable
          accessibilityHint={profileHint}
          accessibilityLabel="View sender profile"
          accessibilityRole="button"
          className="flex-1 items-center justify-center rounded-full border border-hairline bg-surfaceMuted/75 px-4 py-3"
          onPress={() => onOpenProfile?.(request.senderUserId)}
          style={({ pressed }) => ({ opacity: pressed ? 0.88 : 1 })}
        >
          <Text className="text-[12px] font-semibold uppercase tracking-[0.12em] text-ink/90">
            Profile
          </Text>
        </Pressable>
        <Pressable
          accessibilityHint={intentHint}
          accessibilityLabel="View request intent"
          accessibilityRole="button"
          className="flex-1 items-center justify-center rounded-full border border-hairline bg-surfaceMuted/75 px-4 py-3"
          onPress={() => onOpenIntentDetail?.(request.intentId)}
          style={({ pressed }) => ({ opacity: pressed ? 0.88 : 1 })}
        >
          <Text className="text-[12px] font-semibold uppercase tracking-[0.12em] text-ink/90">
            Intent
          </Text>
        </Pressable>
      </View>

      <View className="mt-3 flex-row gap-3">
        <Pressable
          accessibilityHint={acceptHint}
          accessibilityLabel="Accept request"
          accessibilityRole="button"
          accessibilityState={{ disabled: acting }}
          className="flex-1 items-center justify-center rounded-full bg-ink px-4 py-3"
          disabled={acting}
          onPress={onAccept}
          style={({ pressed }) => ({ opacity: pressed || acting ? 0.88 : 1 })}
        >
          {acting ? (
            <ActivityIndicator color={appTheme.colors.background} />
          ) : (
            <Text className="text-[14px] font-semibold text-canvas">
              Accept
            </Text>
          )}
        </Pressable>
        <Pressable
          accessibilityHint={declineHint}
          accessibilityLabel="Decline request"
          accessibilityRole="button"
          accessibilityState={{ disabled: acting }}
          className="flex-1 items-center justify-center rounded-full border border-hairline bg-surfaceMuted/75 px-4 py-3"
          disabled={acting}
          onPress={onReject}
          style={({ pressed }) => ({ opacity: pressed || acting ? 0.88 : 1 })}
        >
          <Text className="text-[14px] font-semibold text-ink/90">Decline</Text>
        </Pressable>
      </View>
    </View>
  );
}
