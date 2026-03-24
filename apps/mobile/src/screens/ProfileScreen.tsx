import Ionicons from "@expo/vector-icons/Ionicons";
import { Text, View } from "react-native";

type ProfileScreenProps = {
  displayName: string;
  email?: string | null;
};

const PROFILE_ROWS = [
  {
    icon: "eye-outline" as const,
    label: "Visibility",
    value: "Available for curated introductions",
  },
  {
    icon: "notifications-outline" as const,
    label: "Notifications",
    value: "Live updates and chat alerts",
  },
  {
    icon: "shield-checkmark-outline" as const,
    label: "Privacy",
    value: "Controls and account protections",
  },
];

export function ProfileScreen({ displayName, email }: ProfileScreenProps) {
  return (
    <View className="flex-1 bg-[#050506] px-5 pt-3">
      <View className="rounded-[28px] border border-white/[0.06] bg-white/[0.03] px-5 py-5">
        <View className="h-12 w-12 items-center justify-center rounded-full bg-white/[0.08]">
          <Text className="text-[18px] font-semibold text-white">
            {(displayName.trim().charAt(0) || "U").toUpperCase()}
          </Text>
        </View>
        <Text className="mt-4 text-[24px] font-semibold tracking-[-0.03em] text-white">
          {displayName}
        </Text>
        <Text className="mt-1 text-[13px] leading-[20px] text-white/42">
          {email || "Manage your account, privacy, and preferences."}
        </Text>
      </View>

      <View className="mt-5 gap-3">
        {PROFILE_ROWS.map((row) => (
          <View
            className="flex-row items-center gap-3 rounded-[22px] border border-white/[0.06] bg-white/[0.025] px-4 py-4"
            key={row.label}
          >
            <View className="h-10 w-10 items-center justify-center rounded-full bg-white/[0.05]">
              <Ionicons
                color="rgba(255,255,255,0.82)"
                name={row.icon}
                size={18}
              />
            </View>
            <View className="min-w-0 flex-1">
              <Text className="text-[15px] font-medium text-white/88">
                {row.label}
              </Text>
              <Text className="mt-1 text-[12px] leading-[18px] text-white/38">
                {row.value}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}
