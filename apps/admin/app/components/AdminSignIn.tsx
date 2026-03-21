"use client";

import { ShieldCheck } from "lucide-react";
import { useState } from "react";

import { Button } from "@/app/components/ui/button";

/** Same still as mobile `WelcomeBackdrop` fallback (Unsplash, app docs). */
const SIGN_IN_BACKDROP_STILL =
  "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=1800&q=85";

export function AdminSignIn({
  onGoogleSignIn,
  errorText,
}: {
  onGoogleSignIn: () => Promise<void>;
  errorText?: string | null;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-black text-white">
      {/* Backdrop layers — aligned with mobile auth: still + bottom-heavy scrim */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-[0.22] saturate-[0.85]"
        style={{ backgroundImage: `url('${SIGN_IN_BACKDROP_STILL}')` }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/35 via-black/55 to-black/95"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_60%_at_50%_-10%,rgba(245,158,11,0.12),transparent_55%)]"
      />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-md flex-col justify-end px-6 pb-14 pt-16 sm:justify-center sm:px-8 sm:pb-16">
        <div className="text-center">
          <div className="mx-auto flex w-fit rounded-3xl border border-white/25 bg-black p-3 shadow-lg shadow-black/40">
            <img
              alt="OpenSocial"
              className="h-14 w-14"
              height={56}
              src="/brand/logo.svg"
              width={56}
            />
          </div>
          <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/55">
            OpenSocial
          </p>
          <h1 className="mt-6 font-[var(--font-heading)] text-[clamp(1.65rem,6vw,1.85rem)] font-semibold leading-[1.12] tracking-tight text-white">
            Operator console
          </h1>
          <p className="mx-auto mt-2.5 flex max-w-sm items-center justify-center gap-2 text-[15px] leading-relaxed text-white/75">
            <ShieldCheck
              aria-hidden
              className="h-4 w-4 shrink-0 text-primary/90"
              strokeWidth={2}
            />
            <span>
              Sign in with Google. Only approved accounts can continue.
            </span>
          </p>
        </div>

        <div className="mt-10 space-y-4">
          {errorText ? (
            <p
              className="rounded-2xl border border-rose-500/35 bg-rose-950/40 px-4 py-3 text-center text-sm text-rose-100"
              role="alert"
            >
              {errorText}
            </p>
          ) : null}

          <Button
            className="h-12 w-full gap-3 rounded-full border-0 bg-white text-[15px] font-medium text-[#0d0d0d] shadow-md transition-[transform,box-shadow] hover:bg-white hover:shadow-lg active:scale-[0.99]"
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
          >
            <GoogleMark />
            Continue with Google
          </Button>
          <p className="text-center text-[11px] leading-relaxed text-white/55">
            Google opens in this window, then you return to the console.
          </p>
        </div>
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
