import type { ChatReplyReference } from "@opensocial/types";

interface ChatBubbleProps {
  role: "user" | "agent" | "workflow" | "system" | "error";
  body: string;
  reply?: ChatReplyReference | null;
  editedAt?: string | null;
  onReply?: () => void;
}

export function ChatBubble({
  body,
  editedAt,
  onReply,
  reply,
  role,
}: ChatBubbleProps) {
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
      onDoubleClick={onReply}
    >
      {reply ? (
        <p
          className={`mb-2 rounded-2xl border-l-2 px-3 py-2 text-xs leading-5 ${
            isUser
              ? "border-slate-950/15 bg-slate-950/8 text-slate-950/70"
              : "border-white/10 bg-black/10 text-white/55"
          }`}
        >
          {reply.excerpt}
        </p>
      ) : null}
      <p className={`text-sm leading-6 ${textClass}`}>{body}</p>
      {editedAt ? (
        <p
          className={`mt-1 text-[11px] ${
            isUser ? "text-slate-950/55" : "text-white/40"
          }`}
        >
          Edited
        </p>
      ) : null}
      {onReply ? (
        <button
          className={`mt-2 text-[11px] font-medium ${
            isUser ? "text-slate-950/65" : "text-white/45"
          }`}
          onClick={onReply}
          type="button"
        >
          Reply
        </button>
      ) : null}
    </div>
  );
}
