"use client";

import { LayoutDashboard, LogOut, PanelLeft } from "lucide-react";
import { type ReactNode, useState } from "react";

import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Separator } from "@/app/components/ui/separator";
import { cn } from "@/app/lib/cn";

export function AdminShell({
  navItems,
  activeId,
  onNavigate,
  title,
  subtitle,
  summary,
  sessionLabel,
  sessionTitle,
  busyKey,
  onSignOut,
  activeDescription,
  children,
}: {
  navItems: Array<{ id: string; label: string }>;
  activeId: string;
  onNavigate: (id: string) => void;
  title: string;
  subtitle: string;
  summary: string;
  sessionLabel: string;
  sessionTitle: string;
  busyKey: string | null;
  onSignOut: () => void;
  /** Long-form tab hint from workbench config */
  activeDescription?: string;
  children: ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const activeNav = navItems.find((item) => item.id === activeId);

  return (
    <div className="flex min-h-screen w-full">
      {/* Mobile drawer backdrop */}
      {sidebarOpen ? (
        <button
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={() => setSidebarOpen(false)}
          type="button"
        />
      ) : null}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-60 flex-col border-r border-border bg-card/95 shadow-xl backdrop-blur transition-transform duration-200 md:static md:z-0 md:translate-x-0 md:shadow-none",
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        )}
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <LayoutDashboard aria-hidden className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              OpenSocial
            </p>
            <p className="truncate font-[var(--font-heading)] text-base font-semibold text-foreground">
              Admin
            </p>
          </div>
        </div>

        <nav
          aria-label="Workbench sections"
          className="flex flex-1 flex-col gap-0.5 p-3"
        >
          {navItems.map((item) => (
            <Button
              className="justify-start gap-2 font-normal"
              key={item.id}
              onClick={() => {
                onNavigate(item.id);
                setSidebarOpen(false);
              }}
              variant={activeId === item.id ? "secondary" : "ghost"}
            >
              <span className="truncate">{item.label}</span>
            </Button>
          ))}
        </nav>

        <div className="border-t border-border p-3">
          <p className="px-2 text-[0.65rem] text-muted-foreground">
            Signed-in operator context is sent as RBAC headers on each request.
          </p>
        </div>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-border bg-background/90 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/75 md:px-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <Button
                className="shrink-0 md:hidden"
                onClick={() => setSidebarOpen((open) => !open)}
                size="icon"
                type="button"
                variant="outline"
              >
                <PanelLeft className="h-4 w-4" />
                <span className="sr-only">Toggle navigation</span>
              </Button>
              <div className="min-w-0">
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {subtitle}
                </p>
                <h1 className="font-[var(--font-heading)] text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
                  {title}
                </h1>
                {activeNav ? (
                  <p className="mt-1 text-xs text-muted-foreground md:text-sm">
                    {activeNav.label}
                  </p>
                ) : null}
                {activeDescription ? (
                  <p className="mt-1 hidden max-w-3xl text-xs leading-relaxed text-muted-foreground md:block">
                    {activeDescription}
                  </p>
                ) : null}
                <p className="mt-2 hidden text-xs text-muted-foreground sm:block">
                  {summary}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <Badge
                className="max-w-[12rem] truncate font-normal"
                title={sessionTitle}
                variant="muted"
              >
                {sessionLabel}
              </Badge>
              <Badge variant={busyKey ? "default" : "outline"}>
                {busyKey ? `busy · ${busyKey}` : "ready"}
              </Badge>
              <Separator
                className="hidden h-6 sm:block"
                orientation="vertical"
              />
              <Button
                className="gap-2"
                onClick={onSignOut}
                size="sm"
                type="button"
                variant="outline"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </Button>
            </div>
          </div>
        </header>

        <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 md:px-8 md:py-6">
          {children}
        </div>
      </div>
    </div>
  );
}
