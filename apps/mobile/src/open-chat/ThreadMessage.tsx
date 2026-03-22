import Markdown from "react-native-markdown-display";
import { Text, View } from "react-native";

import type { ChatBubbleRole } from "../types";

const markdownStyles = {
  body: {
    color: "rgba(255,255,255,0.92)",
    fontSize: 16,
    lineHeight: 24,
  },
  paragraph: { marginBottom: 0, marginTop: 0 },
  link: { color: "#7dd3c0" },
};

const systemMarkdownStyles = {
  ...markdownStyles,
  body: {
    ...markdownStyles.body,
    fontSize: 14,
    lineHeight: 21,
    color: "rgba(255,255,255,0.72)",
  },
};

interface ThreadMessageProps {
  role: ChatBubbleRole;
  body: string;
}

/**
 * Premium thread bubble: restrained, readable, not iMessage/WhatsApp clone.
 */
export function ThreadMessage({ body, role }: ThreadMessageProps) {
  if (role === "workflow") {
    return (
      <View className="mb-3 items-center px-4 py-1">
        <Text className="text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-white/38">
          {body}
        </Text>
      </View>
    );
  }

  if (role === "user") {
    return (
      <View className="mb-3 max-w-[90%] self-end">
        <View className="rounded-[20px] border border-white/12 bg-white/[0.07] px-4 py-3">
          <Text className="text-[16px] leading-[24px] text-white/95">
            {body}
          </Text>
        </View>
      </View>
    );
  }

  if (role === "error") {
    return (
      <View className="mb-3 max-w-[92%] self-start rounded-[18px] border border-rose-400/25 bg-rose-500/[0.12] px-4 py-3">
        <Text className="text-[14px] leading-[21px] text-rose-100/95">
          {body}
        </Text>
      </View>
    );
  }

  if (role === "system") {
    return (
      <View className="mb-3 max-w-[94%] self-start rounded-[16px] border border-white/[0.07] bg-white/[0.035] px-3.5 py-2.5">
        <Markdown style={systemMarkdownStyles}>{body}</Markdown>
      </View>
    );
  }

  return (
    <View className="mb-3 max-w-[92%] self-start">
      <View className="rounded-[20px] border border-white/[0.08] bg-white/[0.045] px-4 py-3">
        <Markdown style={markdownStyles}>{body}</Markdown>
      </View>
    </View>
  );
}
