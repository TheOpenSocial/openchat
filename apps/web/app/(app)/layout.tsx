"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

import { AppLoadingScreen } from "@/src/components/layout/AppLoadingScreen";
import { AppShell } from "@/src/components/layout/AppShell";
import { useAppSession } from "@/src/features/app-shell/app-session";

const titles: Record<string, { title: string; subtitle: string }> = {
  "/onboarding": {
    title: "Onboarding",
    subtitle:
      "Set up the details that shape routing and trust-aware discovery.",
  },
  "/home": {
    title: "Home",
    subtitle: "Capture intent, track routing, and keep the thread moving.",
  },
  "/requests": {
    title: "Requests",
    subtitle: "Review incoming requests with safety and timing controls.",
  },
  "/chats": {
    title: "Chats",
    subtitle: "Human-to-human threads open only after explicit acceptance.",
  },
  "/discover": {
    title: "Discover",
    subtitle: "Browse sparse, high-signal recommendations and search results.",
  },
  "/circles": {
    title: "Circles",
    subtitle:
      "Recurring social flows for continuity, groups, and repeat sessions.",
  },
  "/automations": {
    title: "Automations",
    subtitle: "Saved searches and scheduled briefings on typed rails.",
  },
  "/profile": {
    title: "Profile",
    subtitle: "Preferences, privacy controls, memory settings, and identity.",
  },
};

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { banner, bootstrapping, isOnline, profileComplete, session, signOut } =
    useAppSession();

  useEffect(() => {
    if (bootstrapping) {
      return;
    }
    if (!session) {
      router.replace("/");
      return;
    }
    if (!profileComplete && pathname !== "/onboarding") {
      router.replace("/onboarding");
      return;
    }
    if (profileComplete && pathname === "/onboarding") {
      router.replace("/home");
    }
  }, [bootstrapping, pathname, profileComplete, router, session]);

  if (bootstrapping || !session) {
    return <AppLoadingScreen label="Securing your workspace…" />;
  }

  const current = titles[pathname] ?? {
    title: "OpenSocial",
    subtitle: "Intent-driven social shell.",
  };

  return (
    <AppShell
      banner={banner}
      isOnline={isOnline}
      onSignOut={signOut}
      subtitle={current.subtitle}
      title={current.title}
    >
      {children}
    </AppShell>
  );
}
