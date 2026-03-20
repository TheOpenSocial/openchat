export function AppLoading({ label = "Loading…" }: { label?: string }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
      <div
        aria-label={label}
        className="h-9 w-9 motion-safe:animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary"
        role="progressbar"
      />
      <p className="text-sm text-muted-foreground">{label}</p>
    </main>
  );
}
