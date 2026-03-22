"use client";

import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { BrandSignInLayout } from "@/src/components/BrandSignInLayout";
import { AppLoadingScreen } from "@/src/components/layout/AppLoadingScreen";
import { WorkspaceKicker } from "@/src/components/layout/workspace";
import { Alert } from "@/src/components/ui/alert";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { useAppSession } from "@/src/features/app-shell/app-session";
import { GoogleMark } from "@/src/components/GoogleMark";

const highlights = [
  {
    title: "Plans, not endless feeds",
    body: "Say what you want to do or who you want to meet and keep the whole flow in one place.",
  },
  {
    title: "Routing you can follow",
    body: "See what the system understood, what is happening now, and what the next step is.",
  },
  {
    title: "Private by default",
    body: "Your chats, requests, preferences, and profile stay inside the people and paths you choose.",
  },
] as const;

export function LandingScreen() {
  const router = useRouter();
  const {
    allowDemoAuth,
    authLoading,
    banner,
    bootstrapping,
    isDesignMock,
    isOnline,
    profileComplete,
    session,
    signInWithDemoCode,
    signInWithPreview,
    startGoogleOAuth,
  } = useAppSession();
  const [authCode, setAuthCode] = useState("demo-web");

  useEffect(() => {
    if (!bootstrapping && session) {
      router.replace(profileComplete ? "/home" : "/onboarding");
    }
  }, [bootstrapping, profileComplete, router, session]);

  if (bootstrapping || session) {
    return <AppLoadingScreen label="Restoring session…" />;
  }

  return (
    <BrandSignInLayout contentClassName="justify-between">
      <div className="grid min-h-[calc(100vh-5rem)] gap-12 lg:grid-cols-[minmax(0,1.3fr)_minmax(320px,420px)] lg:items-end">
        <section className="flex max-w-[640px] flex-col justify-end pb-6 lg:pb-10">
          <div className="flex items-center gap-3">
            <div className="rounded-[1.4rem] border border-white/15 bg-black/25 p-3 shadow-[0_16px_40px_rgba(0,0,0,0.28)] backdrop-blur">
              <img
                alt="OpenSocial"
                className="h-12 w-12"
                height={48}
                src="/brand/logo.svg"
                width={48}
              />
            </div>
            <WorkspaceKicker className="text-white/58">
              OpenSocial
            </WorkspaceKicker>
          </div>

          <h1
            className="mt-8 max-w-[10ch] font-[var(--font-heading)] text-[clamp(3.4rem,8vw,6.2rem)] font-semibold leading-[0.94] tracking-[-0.04em] text-white"
            data-testid={isDesignMock ? "web-design-auth-title" : undefined}
          >
            {isDesignMock
              ? "Explore the routed shell"
              : "Meet through plans, not feeds"}
          </h1>
          <p className="mt-5 max-w-[34rem] text-[1.05rem] leading-7 text-white/72">
            {isDesignMock
              ? "Preview the OpenSocial web workspace with realistic mock data and no API dependency."
              : "Describe what you want to do or who you want to meet. OpenSocial routes the request, shows what is happening, and opens human chat only after someone says yes."}
          </p>

          <div className="mt-8 grid gap-4 border-t border-white/12 pt-5 sm:grid-cols-3">
            {highlights.map((item) => (
              <div key={item.title}>
                <p className="font-[var(--font-heading)] text-sm font-semibold text-white/94">
                  {item.title}
                </p>
                <p className="mt-2 text-sm leading-6 text-white/56">
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[calc(var(--radius)+12px)] border border-white/12 bg-black/32 p-5 shadow-[0_26px_60px_rgba(0,0,0,0.32)] backdrop-blur-lg sm:p-6">
          <WorkspaceKicker className="text-white/45">
            {isDesignMock ? "Preview access" : "Secure sign in"}
          </WorkspaceKicker>
          <h2 className="mt-4 font-[var(--font-heading)] text-2xl font-semibold tracking-tight text-white">
            {isDesignMock ? "Open the product preview" : "Continue with Google"}
          </h2>
          <p className="mt-2 text-sm leading-6 text-white/62">
            {isDesignMock
              ? "Use the design mock to review the routed shell and conversational product flow."
              : "Keep your profile, routing state, and chats in sync across sessions."}
          </p>

          {banner ? (
            <div className="mt-5">
              <Alert
                variant={
                  banner.tone === "error"
                    ? "destructive"
                    : banner.tone === "success"
                      ? "success"
                      : "default"
                }
              >
                {banner.text}
              </Alert>
            </div>
          ) : null}

          <div className="mt-6 space-y-3">
            {isDesignMock ? (
              <Button
                className="h-12 w-full rounded-full"
                data-testid="web-design-preview-signin"
                onClick={() => {
                  void signInWithPreview().then((path) => router.push(path));
                }}
                type="button"
                variant="primary"
              >
                <Sparkles className="h-4 w-4" />
                Enter preview
              </Button>
            ) : (
              <Button
                className="h-12 w-full rounded-full bg-white text-[15px] font-medium text-[#0d0d0d] hover:bg-white"
                disabled={authLoading || !isOnline}
                onClick={() => {
                  void startGoogleOAuth();
                }}
                type="button"
              >
                <GoogleMark />
                {authLoading ? "Redirecting…" : "Continue with Google"}
              </Button>
            )}
            <p className="text-xs leading-5 text-white/45">
              {isDesignMock
                ? "Best for design review, layout QA, and product walkthroughs."
                : "Google sign-in keeps the experience consistent across the web shell and admin-approved flows."}
            </p>
          </div>

          {allowDemoAuth ? (
            <details className="mt-6 rounded-[calc(var(--radius)+2px)] border border-white/10 bg-white/[0.03] px-4 py-3 text-left">
              <summary className="cursor-pointer text-sm text-white/55">
                Developer sign-in
              </summary>
              <p className="mt-3 text-xs leading-5 text-white/42">
                Uses the API demo exchange when demo auth is enabled
                server-side.
              </p>
              <Input
                className="mt-3"
                onChange={(event) => setAuthCode(event.currentTarget.value)}
                placeholder="demo-web"
                value={authCode}
              />
              <div className="mt-3 flex gap-2">
                <Button
                  onClick={() => {
                    void signInWithDemoCode(authCode).then((path) =>
                      router.push(path),
                    );
                  }}
                  type="button"
                  variant="secondary"
                >
                  Sign in with code
                </Button>
              </div>
            </details>
          ) : null}
        </section>
      </div>
    </BrandSignInLayout>
  );
}
