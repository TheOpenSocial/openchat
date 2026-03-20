"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { AppLoading } from "@/app/components/AppLoading";
import { Button } from "@/app/components/ui/button";
import { Panel } from "@/app/components/Panel";
import { exchangeGoogleAuthCode } from "@/app/lib/api";
import { saveAdminSession } from "@/app/lib/admin-session";

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState("Completing sign-in…");

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
        const result = await exchangeGoogleAuthCode(code);
        if (cancelled) {
          return;
        }
        saveAdminSession({
          userId: result.user.id,
          email: result.user.email,
          displayName: result.user.displayName,
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          sessionId: result.sessionId,
        });
        router.replace("/");
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
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-12">
      <Panel
        subtitle="Exchanging the authorization code for a session."
        title="Signing you in"
      >
        <p className="text-sm leading-relaxed text-card-foreground">
          {message}
        </p>
        <Button asChild className="mt-5 w-full" variant="outline">
          <Link href="/">Back to console</Link>
        </Button>
      </Panel>
    </main>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<AppLoading />}>
      <CallbackContent />
    </Suspense>
  );
}
