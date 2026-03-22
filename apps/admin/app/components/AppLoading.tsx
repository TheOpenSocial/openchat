export function AppLoading({ label = "Loading…" }: { label?: string }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-5 bg-background px-4 text-foreground">
      <div className="rounded-lg border border-border bg-card p-2">
        <img
          alt=""
          className="h-10 w-10"
          height={40}
          src="/brand/logo.svg"
          width={40}
        />
      </div>
      <div
        aria-label={label}
        className="h-8 w-8 motion-safe:animate-spin rounded-full border-2 border-muted border-t-foreground"
        role="progressbar"
      />
      <p className="text-sm text-muted-foreground">{label}</p>
    </main>
  );
}
