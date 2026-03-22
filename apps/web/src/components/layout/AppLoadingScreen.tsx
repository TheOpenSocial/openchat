export function AppLoadingScreen({ label = "Loading…" }: { label?: string }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-5 bg-black px-6 text-white">
      <div className="rounded-[1.35rem] border border-white/12 bg-white/[0.03] p-3 shadow-[0_24px_60px_rgba(0,0,0,0.35)] backdrop-blur">
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
        className="h-9 w-9 rounded-full border-2 border-white/14 border-t-amber-400 motion-safe:animate-spin"
        role="progressbar"
      />
      <p className="text-sm text-white/52">{label}</p>
    </main>
  );
}
