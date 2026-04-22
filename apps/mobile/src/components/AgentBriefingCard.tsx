import Ionicons from "@expo/vector-icons/Ionicons";
import { Text, View } from "react-native";

import { SurfaceCard } from "./SurfaceCard";
import { appTheme } from "../theme";

type AgentBriefingCardProps = {
  body: string;
  eyebrow?: string;
  title: string;
};

export function AgentBriefingCard({
  body,
  eyebrow = "Agent brief",
  title,
}: AgentBriefingCardProps) {
  return (
    <SurfaceCard
      className="mb-5"
      style={{
        backgroundColor: appTheme.colors.panelMuted,
        borderColor: appTheme.colors.hairlineStrong,
      }}
    >
      <View className="flex-row items-start gap-3">
        <View
          className="mt-0.5 h-9 w-9 items-center justify-center rounded-full border"
          style={{
            backgroundColor: appTheme.colors.panel,
            borderColor: appTheme.colors.hairlineStrong,
          }}
        >
          <Ionicons color={appTheme.colors.inkSoft} name="sparkles" size={16} />
        </View>
        <View className="min-w-0 flex-1">
          <Text
            className="text-[10px] font-semibold uppercase tracking-[0.14em]"
            style={{ color: appTheme.colors.inkFaint }}
          >
            {eyebrow}
          </Text>
          <Text
            className="mt-1 text-[17px] font-semibold tracking-[-0.03em]"
            style={{ color: appTheme.colors.ink }}
          >
            {title}
          </Text>
          <Text
            className="mt-2 text-[13px] leading-[20px]"
            style={{ color: appTheme.colors.inkMuted }}
          >
            {body}
          </Text>
        </View>
      </View>
    </SurfaceCard>
  );
}
