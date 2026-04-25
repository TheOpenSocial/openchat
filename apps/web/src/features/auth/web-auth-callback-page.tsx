"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { api } from "@/src/lib/api";
import { saveStoredSession } from "@/src/lib/session";
import type { WebSession } from "@/src/types";

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState("Completing sign-in...");

  useEffect(() => {
    const error = searchParams.get("error");
    const errorDescription = searchParams.get("error_description");
    const code = searchParams.get("code");

    if (error) {
      setMessage(
        errorDescription && errorDescription.length > 0
          ? errorDescription
          : `Google sign-in failed (${error}).`,
      );
      return;
    }

    if (!code) {
      setMessage("Missing authorization code. Close this tab and try again.");
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const result = await api.authGoogleCallback(code);
        if (cancelled) {
          return;
        }
        const session: WebSession = {
          userId: result.user.id,
          displayName: result.user.displayName,
          email: result.user.email,
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          sessionId: result.sessionId,
        };
        saveStoredSession(session);
        router.replace("/home");
      } catch (err) {
        if (!cancelled) {
          setMessage(
            err instanceof Error ? err.message : "Could not finish sign-in.",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router, searchParams]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#212121] px-6 py-12">
      <div className="w-full max-w-sm text-center">
        <img
          alt=""
          className="mx-auto h-12 w-12 rounded-xl ring-1 ring-white/15"
          height={48}
          src="/brand/logo.svg"
          width={48}
        />
        <p className="mt-5 font-[var(--font-heading)] text-lg text-white">
          Signing you in
        </p>
        <p className="mt-3 text-sm leading-relaxed text-white/60">{message}</p>
        <Link
          className="mt-8 inline-block text-sm text-white/80 underline decoration-white/30 underline-offset-4 hover:text-white"
          href="/"
        >
          Back to OpenSocial
        </Link>
      </div>
    </main>
  );
}

function CallbackFallback() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#212121]">
      <p className="text-sm text-white/60">Loading...</p>
    </main>
  );
}

export function WebAuthCallbackPage() {
  return (
    <Suspense fallback={<CallbackFallback />}>
      <CallbackContent />
    </Suspense>
  );
}
