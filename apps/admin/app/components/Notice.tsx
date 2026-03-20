import { Alert } from "@/app/components/ui/alert";

export function Notice({
  tone,
  text,
}: {
  tone: "info" | "success" | "error";
  text: string;
}) {
  const variant =
    tone === "error"
      ? "destructive"
      : tone === "success"
        ? "success"
        : "default";

  return (
    <Alert role={tone === "error" ? "alert" : "status"} variant={variant}>
      {text}
    </Alert>
  );
}
