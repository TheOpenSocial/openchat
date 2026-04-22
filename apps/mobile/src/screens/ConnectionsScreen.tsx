import Ionicons from "@expo/vector-icons/Ionicons";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { EmptyState } from "../components/EmptyState";
import { InlineNotice } from "../components/InlineNotice";
import { PrimaryButton } from "../components/PrimaryButton";
import { ConnectionRow } from "../features/connections/components/ConnectionRow";
import { useConnections } from "../features/connections/hooks/useConnections";
import { hapticSelection } from "../lib/haptics";
import { appTheme } from "../theme";

type ConnectionsScreenProps = {
  accessToken: string;
  onClose: () => void;
  onOpenChat?: (chatId: string) => void;
  onOpenProfile?: (targetUserId: string) => void;
  userId: string;
};

export function ConnectionsScreen({
  accessToken,
  onClose,
  onOpenChat,
  onOpenProfile,
  userId,
}: ConnectionsScreenProps) {
  const { error, items, loading, refresh, refreshing } = useConnections({
    accessToken,
    userId,
  });

  return (
    <SafeAreaView
      className="flex-1 bg-[#050506]"
      style={{ flex: 1 }}
      testID="connections-screen"
    >
      <View className="flex-1 bg-[#050506]" style={{ flex: 1 }}>
        <View className="flex-row items-start justify-between px-5 pb-5 pt-3">
          <View className="max-w-[280px] gap-2">
            <Text className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/34">
              Connections
            </Text>
            <Text className="text-[34px] font-semibold tracking-[-0.05em] text-white">
              People and groups you're connected to
            </Text>
            <Text className="text-[14px] leading-[21px] text-white/52">
              Keep track of the people and small groups that are already in your
              orbit.
            </Text>
          </View>
          <Pressable
            accessibilityLabel="Close connections"
            accessibilityRole="button"
            className="mt-1 h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04]"
            onPress={() => {
              hapticSelection();
              onClose();
            }}
            style={({ pressed }) => ({ opacity: pressed ? 0.88 : 1 })}
            testID="connections-close"
          >
            <Ionicons color="rgba(255,255,255,0.84)" name="close" size={18} />
          </Pressable>
        </View>

        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 40, paddingHorizontal: 20 }}
          refreshControl={
            <RefreshControl
              onRefresh={() => {
                void refresh();
              }}
              colors={[appTheme.colors.ink]}
              refreshing={refreshing}
              tintColor={appTheme.colors.ink}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {error ? <InlineNotice text={error} tone="error" /> : null}

          {loading ? (
            <View className="items-center justify-center py-20">
              <ActivityIndicator color={appTheme.colors.ink} />
              <Text className="mt-4 text-[14px] text-muted">
                Loading connections
              </Text>
            </View>
          ) : items.length > 0 ? (
            <>
              <View className="mb-4">
                <PrimaryButton
                  label={refreshing ? "Refreshing..." : "Refresh connections"}
                  onPress={() => {
                    void refresh();
                  }}
                  variant="secondary"
                />
              </View>
              <View className="gap-3">
                {items.map((item) => (
                  <ConnectionRow
                    key={item.chatId}
                    item={item}
                    onOpenProfile={(pressedItem) => {
                      if (pressedItem.targetUserId) {
                        hapticSelection();
                        onOpenProfile?.(pressedItem.targetUserId);
                      }
                    }}
                    onPress={() => {
                      if (onOpenChat) {
                        hapticSelection();
                        onOpenChat(item.chatId);
                      }
                    }}
                  />
                ))}
              </View>
            </>
          ) : (
            <EmptyState
              description="When a connection becomes real, I’ll keep it here so you can jump back in without searching for it."
              title="No connections yet"
            />
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
