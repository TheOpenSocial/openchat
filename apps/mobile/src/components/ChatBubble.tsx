import { cva } from "class-variance-authority";
import { Pressable, Text } from "react-native";
import type { ChatReplyReference } from "@opensocial/types";

import type { ChatMessageStatusRecord } from "../lib/api";
import { cn } from "../lib/cn";
import type { ChatBubbleRole } from "../types";

interface ChatBubbleProps {
  role: ChatBubbleRole;
  body: string;
  reply?: ChatReplyReference | null;
  deliveryStatus?: "sending" | "queued" | "failed";
  messageStatus?: ChatMessageStatusRecord | null;
  editedAt?: string | null;
  isDeleted?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
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

function messageStatusLabel(status?: ChatMessageStatusRecord | null) {
  if (!status) {
    return null;
  }

  if (status.state === "read") {
    return "Read";
  }

  if (status.state === "delivered") {
    return "Delivered";
  }

  return "Sent";
}

export function ChatBubble({
  body,
  isDeleted = false,
  role,
  reply,
  deliveryStatus,
  messageStatus,
  editedAt,
  onPress,
  onLongPress,
  testID,
}: ChatBubbleProps) {
  const useMarkdown = role === "agent" || role === "system";
  const bubbleContent = (
    <>
      {reply ? (
        <Text
          className={cn(
            "mb-2 rounded-2xl border-l-2 border-hairline/90 px-3 py-2 text-[12px] leading-[17px]",
            role === "user"
              ? "bg-black/10 text-ink/70"
              : "bg-black/10 text-muted",
          )}
        >
          <Text className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
            Replying to
          </Text>
          {"\n"}
          {reply.excerpt}
        </Text>
      ) : null}
      {useMarkdown ? (
        <Text
          className={cn(
            textVariants({ role }),
            isDeleted ? "italic text-ink/55" : undefined,
          )}
        >
          {body}
        </Text>
      ) : (
        <Text
          className={cn(
            textVariants({ role }),
            isDeleted ? "italic text-ink/55" : undefined,
          )}
        >
          {body}
        </Text>
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
      ) : role === "user" && (messageStatus || editedAt) ? (
        <Text className="mt-1 text-right text-[10px] text-ink/55">
          {messageStatusLabel(messageStatus)}
          {messageStatus && editedAt ? " · " : ""}
          {editedAt ? "Edited" : ""}
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
      disabled={!onPress && !onLongPress}
      onLongPress={onLongPress}
      onPress={onPress}
      testID={testID}
    >
      {bubbleContent}
    </Pressable>
  );
}
