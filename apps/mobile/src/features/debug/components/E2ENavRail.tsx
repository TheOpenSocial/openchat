import { Pressable, Text, View } from "react-native";

type E2ENavRailProps = {
  onOpenActivity: () => void;
  onOpenChats: () => void;
  onOpenHome: () => void;
  onOpenInbox: () => void;
  onOpenPeerProfile?: () => void;
  onOpenProfile: () => void;
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
      onPress={onPress}
      testID={testID}
    >
      <Text className="text-[11px] font-semibold uppercase tracking-[0.08em] text-white/88">
        {label}
      </Text>
    </Pressable>
  );
}

export function E2ENavRail({
  onOpenActivity,
  onOpenChats,
  onOpenHome,
  onOpenInbox,
  onOpenPeerProfile,
  onOpenProfile,
  onOpenSettings,
  visible = true,
}: E2ENavRailProps) {
  if (!visible) {
    return null;
  }

  return (
    <View
      className="absolute left-4 top-24 z-40 gap-2 rounded-[22px] border border-white/10 bg-black/35 px-2 py-2"
      testID="e2e-nav-rail"
    >
      <RailButton label="Home" onPress={onOpenHome} testID="e2e-nav-home" />
      <RailButton label="Chats" onPress={onOpenChats} testID="e2e-nav-chats" />
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
      <RailButton label="Inbox" onPress={onOpenInbox} testID="e2e-nav-inbox" />
    </View>
  );
}
