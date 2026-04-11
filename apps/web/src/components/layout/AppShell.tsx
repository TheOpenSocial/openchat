"use client";

import {
  Activity,
  BellRing,
  Compass,
  Home,
  MessageSquare,
  Orbit,
  Search,
  Settings2,
  SlidersHorizontal,
  TimerReset,
  UsersRound,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { Alert } from "@/src/components/ui/alert";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/lib/cn";
import { RouteTransition } from "@/src/components/layout/RouteTransition";

const navItems = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/activity", label: "Activity", icon: Activity },
  { href: "/requests", label: "Requests", icon: BellRing },
  { href: "/connections", label: "Connections", icon: UsersRound },
  { href: "/chats", label: "Chats", icon: MessageSquare },
  { href: "/discover", label: "Discover", icon: Compass },
  { href: "/circles", label: "Circles", icon: Orbit },
  { href: "/automations", label: "Automations", icon: Settings2 },
  { href: "/saved-searches", label: "Saved searches", icon: Search },
  { href: "/scheduled-tasks", label: "Scheduled tasks", icon: TimerReset },
  { href: "/settings", label: "Settings", icon: SlidersHorizontal },
  { href: "/profile", label: "Profile", icon: UserRound },
] as const;

export function AppShell({
  banner,
  children,
  isOnline,
  onSignOut,
  subtitle,
  title,
}: {
  banner?: { tone: "info" | "error" | "success"; text: string } | null;
  children: ReactNode;
  isOnline: boolean;
  onSignOut: () => void;
  subtitle?: string;
  title?: string;
}) {
  const pathname = usePathname();
  const routeKey = pathname ?? "/";

  return (
    <main className="mx-auto min-h-screen w-full max-w-[1240px] px-4 pb-8 pt-4 md:px-6 md:pb-10 md:pt-5">
      <div className="rounded-[calc(var(--radius)+6px)] border border-[hsl(var(--border-soft))] bg-[hsl(var(--shell))]/92 px-4 py-4 shadow-[0_30px_70px_rgba(0,0,0,0.28)] backdrop-blur md:px-5">
        <header className="border-b border-[hsl(var(--border-soft))] pb-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl border border-white/10 bg-black/20 p-2.5">
                  <img
                    alt=""
                    className="h-8 w-8"
                    height={32}
                    src="/brand/logo.svg"
                    width={32}
                  />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-ash">
                    OpenSocial
                  </p>
                  <h1 className="mt-1 font-[var(--font-heading)] text-[1.7rem] font-semibold tracking-tight text-ink">
                    {title ?? "OpenSocial"}
                  </h1>
                </div>
              </div>
              {subtitle ? (
                <p className="mt-3 max-w-2xl text-sm leading-6 text-ash">
                  {subtitle}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={isOnline ? "success" : "danger"}>
                {isOnline ? "Online" : "Offline"}
              </Badge>
              <Button onClick={onSignOut} type="button" variant="ghost">
                Sign out
              </Button>
            </div>
          </div>

          <nav className="mt-4 flex flex-wrap gap-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active =
                pathname === item.href || pathname?.startsWith(`${item.href}/`);
              return (
                <Link
                  className={cn(
                    "flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium transition",
                    active
                      ? "border-amber-300/35 bg-amber-300/12 text-amber-50"
                      : "border-[hsl(var(--border-soft))] text-white/70 hover:border-[hsl(var(--border))] hover:bg-white/5 hover:text-white",
                  )}
                  href={item.href}
                  key={item.href}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </header>

        <section className="min-w-0 pt-5">
          {banner ? (
            <div className="mb-4">
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

          <RouteTransition routeKey={routeKey}>{children}</RouteTransition>
        </section>
      </div>
    </main>
  );
}
