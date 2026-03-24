import { Text, View } from "react-native";

import type { ChatBubbleRole } from "../types";

interface ThreadMessageProps {
  role: ChatBubbleRole;
  body: string;
}

/**
 * Premium thread bubble: restrained, readable, not iMessage/WhatsApp clone.
 */
export function ThreadMessage({ body, role }: ThreadMessageProps) {
  const compactBody = body.trim();
  const conciseAgentBody =
    role === "agent" && compactBody.length > 190
      ? "Got it. I'm finding people who fit this."
      : compactBody;

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
      <View className="mb-4 max-w-[88%] self-end">
        <View className="rounded-[22px] border border-white/10 bg-white/[0.06] px-4 py-3.5">
          <Text className="text-[16px] leading-[24px] text-white/96">
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
    return (
      <View className="mb-3 self-start rounded-full border border-white/[0.06] bg-white/[0.03] px-3 py-1.5">
        <Text className="text-[12px] leading-[18px] font-medium text-white/52">
          {compactBody}
        </Text>
      </View>
    );
  }

  return (
    <View className="mb-4 max-w-[92%] self-start">
      <Text className="text-[18px] leading-[27px] tracking-[-0.01em] text-white/90">
        {conciseAgentBody}
      </Text>
    </View>
  );
}
