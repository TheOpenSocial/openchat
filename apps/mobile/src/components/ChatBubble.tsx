import { cva } from "class-variance-authority";
import Markdown from "react-native-markdown-display";
import { Platform, Text, View } from "react-native";

import { cn } from "../lib/cn";
import type { ChatBubbleRole } from "../types";

interface ChatBubbleProps {
  role: ChatBubbleRole;
  body: string;
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

const markdownStyles = {
  body: {
    color: "#ececec",
    fontSize: 15,
    lineHeight: 22,
  },
  bullet_list: { marginBottom: 4, marginTop: 4 },
  code_inline: {
    backgroundColor: "#363636",
    borderRadius: 4,
    color: "#e4e4e7",
    fontFamily: Platform.select({
      android: "monospace",
      ios: "Menlo",
      default: "monospace",
    }),
    paddingHorizontal: 4,
  },
  fence: {
    backgroundColor: "#262626",
    borderRadius: 8,
    color: "#e4e4e7",
    fontFamily: Platform.select({
      android: "monospace",
      ios: "Menlo",
      default: "monospace",
    }),
    fontSize: 13,
    marginVertical: 6,
    padding: 8,
  },
  heading1: { color: "#ececec", fontSize: 18, fontWeight: "600" as const },
  heading2: { color: "#ececec", fontSize: 17, fontWeight: "600" as const },
  link: { color: "#2dd4bf" },
  ordered_list: { marginBottom: 4, marginTop: 4 },
  paragraph: { marginBottom: 0, marginTop: 0 },
};

const systemMarkdownStyles = {
  ...markdownStyles,
  body: {
    ...markdownStyles.body,
    fontSize: 14,
    lineHeight: 21,
  },
};

export function ChatBubble({ body, role, testID }: ChatBubbleProps) {
  const useMarkdown = role === "agent" || role === "system";

  return (
    <View
      className={cn(bubbleVariants({ role }))}
      collapsable={false}
      testID={testID}
    >
      {useMarkdown ? (
        <Markdown
          style={role === "system" ? systemMarkdownStyles : markdownStyles}
        >
          {body}
        </Markdown>
      ) : (
        <Text className={cn(textVariants({ role }))}>{body}</Text>
      )}
    </View>
  );
}
