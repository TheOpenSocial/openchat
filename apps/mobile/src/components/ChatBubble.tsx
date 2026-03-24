import { cva } from "class-variance-authority";
import { Pressable, Text } from "react-native";

import { cn } from "../lib/cn";
import type { ChatBubbleRole } from "../types";

interface ChatBubbleProps {
  role: ChatBubbleRole;
  body: string;
  deliveryStatus?: "sending" | "queued" | "failed";
  onPress?: () => void;
  testID?: string;
}

const bubbleVariants = cva("", {
  variants: {
    role: {
      user: "mb-3 max-w-[88%] self-end rounded-[22px] bg-surface px-4 py-2.5",
      agent:
        "mb-3 max-w-[92%] self-start rounded-[22px] border border-hairline/80 bg-surfaceMuted/70 px-4 py-2.5",
      workflow: "mb-4 w-full self-center px-2",
      system:
        "mb-3 max-w-[94%] self-start rounded-2xl border border-hairline/50 bg-surfaceMuted/50 px-4 py-3",
      error:
        "mb-3 max-w-[94%] self-start rounded-2xl border border-rose-500/35 bg-rose-500/10 px-4 py-3",
    },
  },
  defaultVariants: {
    role: "agent",
  },
});

const textVariants = cva("", {
  variants: {
    role: {
      user: "text-[15px] leading-[22px] text-ink",
      agent: "text-[15px] leading-[22px] text-ink",
      workflow:
        "text-center text-[12px] leading-4 font-medium uppercase tracking-wide text-muted",
      system: "text-[14px] leading-[21px] text-ink",
      error: "text-[14px] leading-[21px] text-rose-100",
    },
  },
  defaultVariants: {
    role: "agent",
  },
});

function deliveryStatusLabel(status: "sending" | "queued" | "failed") {
  if (status === "sending") {
    return "Sending...";
  }
  if (status === "queued") {
    return "Queued";
  }
  return "Failed";
}

export function ChatBubble({
  body,
  role,
  deliveryStatus,
  onPress,
  testID,
}: ChatBubbleProps) {
  const useMarkdown = role === "agent" || role === "system";
  const bubbleContent = (
    <>
      {useMarkdown ? (
        <Text className={cn(textVariants({ role }))}>{body}</Text>
      ) : (
        <Text className={cn(textVariants({ role }))}>{body}</Text>
      )}
      {role === "user" && deliveryStatus ? (
        <Text
          className={`mt-1 text-right text-[10px] ${
            deliveryStatus === "failed" ? "text-rose-200" : "text-ink/55"
          }`}
        >
          {deliveryStatusLabel(deliveryStatus)}
          {deliveryStatus === "failed" ? " - tap to retry" : ""}
        </Text>
      ) : null}
    </>
  );

  return (
    <Pressable
      accessibilityLabel={
        role === "user" && deliveryStatus === "failed"
          ? "Retry failed message"
          : undefined
      }
      accessibilityRole={onPress ? "button" : undefined}
      className={cn(bubbleVariants({ role }))}
      collapsable={false}
      disabled={!onPress}
      onPress={onPress}
      testID={testID}
    >
      {bubbleContent}
    </Pressable>
  );
}
