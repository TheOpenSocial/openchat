"use client";

import { useState } from "react";

import { Button } from "@/app/components/ui/button";

export function AdminSignIn({
  onGoogleSignIn,
  errorText,
}: {
  onGoogleSignIn: () => Promise<void>;
  errorText?: string | null;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <main className="relative mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-16 sm:px-8">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.35]"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -20%, hsl(var(--primary) / 0.22), transparent 55%)",
        }}
      />

      <div className="text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-border/80 bg-card/40 shadow-lg backdrop-blur-sm">
          <img
            alt=""
            className="h-10 w-10"
            height={40}
            src="/brand/logo.svg"
            width={40}
          />
        </div>
        <h1 className="mt-10 font-[var(--font-heading)] text-[clamp(2rem,8vw,2.75rem)] font-semibold leading-[1.05] tracking-[0.08em] text-foreground">
          OPENSOCIAL
        </h1>
        <p className="mt-3 text-sm font-medium tracking-wide text-muted-foreground">
          Operator access
        </p>
        <p className="mx-auto mt-6 max-w-sm text-sm leading-relaxed text-muted-foreground/90">
          Sign in with Google. Only approved accounts can open the console.
        </p>
      </div>

      <div className="mt-12 space-y-4">
        {errorText ? (
          <p
            className="rounded-xl border border-destructive/35 bg-destructive/10 px-4 py-3 text-center text-sm text-destructive-foreground"
            role="alert"
          >
            {errorText}
          </p>
        ) : null}

        <Button
          className="h-12 w-full gap-3 rounded-xl border border-border/60 bg-white text-base font-medium text-slate-900 shadow-md transition-[transform,box-shadow] hover:bg-slate-50 hover:shadow-lg active:scale-[0.99]"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onGoogleSignIn();
            } catch {
              setBusy(false);
            }
          }}
          type="button"
          variant="outline"
        >
          <GoogleMark />
          Continue with Google
        </Button>
      </div>
    </main>
  );
}

function GoogleMark() {
  return (
    <svg aria-hidden className="h-5 w-5 shrink-0" viewBox="0 0 24 24">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}
