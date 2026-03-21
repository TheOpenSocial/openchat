export function AppLoading({ label = "Loading…" }: { label?: string }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-5 bg-black px-4 text-white">
      <div className="rounded-2xl border border-white/20 bg-black/60 p-2 shadow-lg shadow-black/40">
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
        className="h-9 w-9 motion-safe:animate-spin rounded-full border-2 border-white/20 border-t-primary"
        role="progressbar"
      />
      <p className="text-sm text-white/55">{label}</p>
    </main>
  );
}
