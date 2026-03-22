"use client";

import { useState } from "react";

import { Button } from "@/app/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";

export function AdminSignIn({
  onGoogleSignIn,
  errorText,
}: {
  onGoogleSignIn: () => Promise<void>;
  errorText?: string | null;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <div className="mb-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-card/90 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
          <img
            alt=""
            className="h-8 w-8"
            height={32}
            src="/brand/logo.svg"
            width={32}
          />
        </div>
        <p className="mt-6 text-xs font-medium uppercase tracking-widest text-muted-foreground">
          OPENSOCIAL
        </p>
        <h1 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold tracking-tight text-foreground">
          Operator console
        </h1>
      </div>

      <Card className="w-full max-w-sm border-border bg-card/95 shadow-[0_20px_48px_rgba(0,0,0,0.24)]">
        <CardHeader className="space-y-1">
          <CardTitle className="text-base">Sign in</CardTitle>
          <CardDescription>
            Continue with Google. Only approved accounts can access the console.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {errorText ? (
            <p
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-foreground"
              role="alert"
            >
              {errorText}
            </p>
          ) : null}

          <Button
            className="w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
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
        </CardContent>
      </Card>
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
