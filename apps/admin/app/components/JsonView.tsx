export function JsonView({
  value,
  emptyLabel,
}: {
  value: unknown;
  emptyLabel?: string;
}) {
  const isEmpty =
    value == null ||
    (Array.isArray(value) && value.length === 0) ||
    (typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length === 0);

  if (isEmpty) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/50 px-3.5 py-4 text-sm leading-relaxed text-muted-foreground">
        {emptyLabel ?? "No data loaded."}
      </div>
    );
  }

  return (
    <pre className="max-h-80 overflow-auto rounded-lg border border-border bg-muted px-3 py-3 font-mono text-[12px] leading-[1.55] text-foreground [tab-size:2]">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}
