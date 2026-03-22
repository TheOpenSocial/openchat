interface ChatBubbleProps {
  role: "user" | "agent" | "workflow" | "system" | "error";
  body: string;
}

export function ChatBubble({ body, role }: ChatBubbleProps) {
  const isUser = role === "user";
  const bubbleClass = isUser
    ? "self-end border border-amber-300/20 bg-amber-300/92"
    : role === "workflow"
      ? "self-start border border-white/8 bg-white/[0.06]"
      : role === "system"
        ? "self-start border border-white/10 bg-white/[0.04]"
        : role === "error"
          ? "self-start border border-rose-500/35 bg-rose-500/10"
          : "self-start border border-white/8 bg-[hsl(var(--panel-muted))]";
  const textClass = isUser
    ? "text-slate-950"
    : role === "error"
      ? "text-rose-100"
      : "text-[hsl(var(--foreground))]";

  return (
    <div
      className={`mb-3 max-w-[90%] rounded-[1.15rem] px-4 py-3 ${bubbleClass}`}
    >
      <p className={`text-sm leading-6 ${textClass}`}>{body}</p>
    </div>
  );
}
