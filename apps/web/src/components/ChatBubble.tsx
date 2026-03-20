interface ChatBubbleProps {
  role: "user" | "agent" | "workflow" | "system" | "error";
  body: string;
}

export function ChatBubble({ body, role }: ChatBubbleProps) {
  const isUser = role === "user";
  const bubbleClass = isUser
    ? "self-end bg-amber-300"
    : role === "workflow"
      ? "self-start bg-slate-700"
      : role === "system"
        ? "self-start border border-slate-600 bg-slate-900/80"
        : role === "error"
          ? "self-start border border-rose-500/50 bg-rose-950/40"
          : "self-start bg-slate-800";
  const textClass = isUser
    ? "text-slate-950"
    : role === "error"
      ? "text-rose-100"
      : "text-slate-100";

  return (
    <div className={`mb-3 max-w-[90%] rounded-2xl px-4 py-3 ${bubbleClass}`}>
      <p className={`text-sm leading-5 ${textClass}`}>{body}</p>
    </div>
  );
}
