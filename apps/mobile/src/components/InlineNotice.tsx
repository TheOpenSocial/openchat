import { Alert } from "./ui/alert";

interface InlineNoticeProps {
  tone: "info" | "error" | "success";
  text: string;
}

export function InlineNotice({ text, tone }: InlineNoticeProps) {
  return <Alert text={text} tone={tone} />;
}
