interface InlineNoticeProps {
  tone: "info" | "error" | "success";
  text: string;
}

const toneClassNames: Record<InlineNoticeProps["tone"], string> = {
  info: "border-sky-500/45 bg-sky-500/12 text-sky-100",
  error: "border-rose-500/45 bg-rose-500/12 text-rose-100",
  success: "border-emerald-500/45 bg-emerald-500/12 text-emerald-100",
};

export function InlineNotice({ text, tone }: InlineNoticeProps) {
  return (
    <div
      className={`rounded-xl border px-3.5 py-2.5 text-sm leading-snug shadow-sm shadow-black/20 ${toneClassNames[tone]}`}
      role="status"
    >
      {text}
    </div>
  );
}
