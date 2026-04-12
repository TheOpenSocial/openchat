import { Text, View } from "react-native";

import { SystemBlobAnimation } from "../components/SystemBlobAnimation";
import { appTheme } from "../theme";
import type { ChatBubbleRole } from "../types";

interface ThreadMessageProps {
  role: ChatBubbleRole;
  body: string;
}

export const RUNTIME_SYSTEM_MESSAGE_PREFIX = "__runtime_status__:";

/**
 * Premium thread bubble: restrained, readable, not iMessage/WhatsApp clone.
 */
export function ThreadMessage({ body, role }: ThreadMessageProps) {
  const compactBody = body.trim();

  if (role === "workflow") {
    return (
      <View className="mb-3 items-center py-1">
        <Text className="text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-white/34">
          {compactBody}
        </Text>
      </View>
    );
  }

  if (role === "user") {
    return (
      <View className="mb-2 max-w-[78%] self-end">
        <View
          className="rounded-[17px] border px-3.5 py-2"
          style={{
            backgroundColor: appTheme.colors.panelMuted,
            borderColor: appTheme.colors.hairline,
          }}
        >
          <Text
            className="text-[13px] leading-[18px]"
            style={{ color: appTheme.colors.ink }}
          >
            {compactBody}
          </Text>
        </View>
      </View>
    );
  }

  if (role === "error") {
    return (
      <View className="mb-4 max-w-[92%] self-start rounded-[18px] border border-rose-400/25 bg-rose-500/[0.12] px-4 py-3">
        <Text className="text-[14px] leading-[21px] text-rose-100/95">
          {compactBody}
        </Text>
      </View>
    );
  }

  if (role === "system") {
    if (compactBody.startsWith(RUNTIME_SYSTEM_MESSAGE_PREFIX)) {
      const label = compactBody
        .slice(RUNTIME_SYSTEM_MESSAGE_PREFIX.length)
        .trim();
      return (
        <View
          className="mb-4 self-start rounded-[16px] border px-3 py-2.5"
          style={{
            backgroundColor: appTheme.colors.panelSoft,
            borderColor: appTheme.colors.hairline,
          }}
        >
          <View className="flex-row items-center gap-2.5">
            <SystemBlobAnimation size={28} />
            <Text
              className="text-[13px] font-medium leading-[18px]"
              style={{ color: appTheme.colors.inkSoft }}
            >
              {label || "Working on it…"}
            </Text>
          </View>
        </View>
      );
    }
    return (
      <View
        className="mb-3 self-start rounded-full border px-3 py-1.5"
        style={{
          backgroundColor: appTheme.colors.panelSoft,
          borderColor: appTheme.colors.hairline,
        }}
      >
        <Text
          className="text-[12px] font-medium leading-[18px]"
          style={{ color: appTheme.colors.inkMuted }}
        >
          {compactBody}
        </Text>
      </View>
    );
  }

  return (
    <View className="mb-2 max-w-[74%] self-start">
      <Text
        className="text-[13px] leading-[18px] tracking-[-0.004em]"
        style={{ color: appTheme.colors.inkSoft }}
        numberOfLines={6}
      >
        {compactBody}
      </Text>
    </View>
  );
}
