import { Modal, Pressable, Text, View } from "react-native";

type E2ENavRailProps = {
  currentScreenTestID?: string;
  onOpenActivity: () => void;
  onOpenChats: () => void;
  onOpenConnections?: () => void;
  onOpenDiscovery?: () => void;
  onOpenHome: () => void;
  onOpenInbox: () => void;
  onOpenPeerProfile?: () => void;
  onOpenProfile: () => void;
  onOpenRecurringCircles?: () => void;
  onOpenSavedSearches?: () => void;
  onOpenScheduledTasks?: () => void;
  onOpenSettings: () => void;
  visible?: boolean;
};

function RailButton({
  label,
  onPress,
  testID,
}: {
  label: string;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable
      className="rounded-full border border-white/12 bg-black/70 px-3 py-2"
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 44,
        minWidth: 180,
        opacity: pressed ? 0.75 : 1,
      })}
      testID={testID}
    >
      <Text className="text-[11px] font-semibold uppercase tracking-[0.08em] text-white/88">
        {label}
      </Text>
    </Pressable>
  );
}

export function E2ENavRail({
  currentScreenTestID,
  onOpenActivity,
  onOpenChats,
  onOpenConnections,
  onOpenDiscovery,
  onOpenHome,
  onOpenInbox,
  onOpenPeerProfile,
  onOpenProfile,
  onOpenRecurringCircles,
  onOpenSavedSearches,
  onOpenScheduledTasks,
  onOpenSettings,
  visible = true,
}: E2ENavRailProps) {
  if (!visible) {
    return null;
  }

  return (
    <Modal
      animationType="none"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      transparent
      visible
    >
      <View className="flex-1" pointerEvents="box-none">
        <View
          className="absolute left-4 top-24 z-40 gap-2 rounded-[22px] border border-white/10 bg-black/75 px-2 py-2"
          style={{ elevation: 9999, zIndex: 9999 }}
          testID="e2e-nav-rail"
        >
          {currentScreenTestID ? (
            <View
              className="h-1 w-1 rounded-full bg-white/70"
              testID={currentScreenTestID}
            />
          ) : null}
          <RailButton label="Home" onPress={onOpenHome} testID="e2e-nav-home" />
          <RailButton
            label="Chats"
            onPress={onOpenChats}
            testID="e2e-nav-chats"
          />
          <RailButton
            label="Profile"
            onPress={onOpenProfile}
            testID="e2e-nav-profile"
          />
          {onOpenPeerProfile ? (
            <RailButton
              label="Peer"
              onPress={onOpenPeerProfile}
              testID="e2e-nav-peer-profile"
            />
          ) : null}
          <RailButton
            label="Settings"
            onPress={onOpenSettings}
            testID="e2e-nav-settings"
          />
          <RailButton
            label="Activity"
            onPress={onOpenActivity}
            testID="e2e-nav-activity"
          />
          <RailButton
            label="Inbox"
            onPress={onOpenInbox}
            testID="e2e-nav-inbox"
          />
          {onOpenConnections ? (
            <RailButton
              label="Connections"
              onPress={onOpenConnections}
              testID="e2e-nav-connections"
            />
          ) : null}
          {onOpenDiscovery ? (
            <RailButton
              label="Discovery"
              onPress={onOpenDiscovery}
              testID="e2e-nav-discovery"
            />
          ) : null}
          {onOpenRecurringCircles ? (
            <RailButton
              label="Circles"
              onPress={onOpenRecurringCircles}
              testID="e2e-nav-recurring-circles"
            />
          ) : null}
          {onOpenSavedSearches ? (
            <RailButton
              label="Searches"
              onPress={onOpenSavedSearches}
              testID="e2e-nav-saved-searches"
            />
          ) : null}
          {onOpenScheduledTasks ? (
            <RailButton
              label="Tasks"
              onPress={onOpenScheduledTasks}
              testID="e2e-nav-scheduled-tasks"
            />
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
