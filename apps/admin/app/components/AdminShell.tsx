"use client";

import { LogOut, PanelLeft } from "lucide-react";
import { type ReactNode, useState } from "react";

import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Separator } from "@/app/components/ui/separator";
import { cn } from "@/app/lib/cn";
import { adminNavIconFor } from "@/app/lib/admin-nav-icons";
import { type AppLocale } from "@/app/lib/i18n";
import { nativeControlClass } from "@/app/lib/form-control-classes";

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
  locale,
  onLocaleChange,
  localeLabel,
  localeEnglishLabel,
  localeSpanishLabel,
  readyLabel,
  busyPrefixLabel,
  signOutLabel,
  operatorContextNote,
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
  locale: AppLocale;
  onLocaleChange: (locale: AppLocale) => void;
  localeLabel: string;
  localeEnglishLabel: string;
  localeSpanishLabel: string;
  readyLabel: string;
  busyPrefixLabel: string;
  signOutLabel: string;
  operatorContextNote: string;
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
          "fixed inset-y-0 left-0 z-50 flex w-60 flex-col border-r border-white/10 bg-black/55 shadow-xl backdrop-blur-xl transition-transform duration-200 md:static md:z-0 md:translate-x-0 md:shadow-none",
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        )}
      >
        <div className="flex items-center gap-3 border-b border-border px-4 py-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-black/50 p-1.5 shadow-inner shadow-black/20">
            <img
              alt=""
              className="h-8 w-8"
              height={32}
              src="/brand/logo.svg"
              width={32}
            />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              OpenSocial
            </p>
            <p className="truncate font-[var(--font-heading)] text-base font-semibold tracking-tight text-foreground">
              Admin
            </p>
          </div>
        </div>

        <nav
          aria-label="Workbench sections"
          className="flex flex-1 flex-col gap-0.5 p-3"
        >
          {navItems.map((item) => {
            const NavIcon = adminNavIconFor(item.id);
            const active = activeId === item.id;
            return (
              <Button
                className={cn(
                  "justify-start gap-3 font-normal",
                  active && "bg-primary/10 text-foreground hover:bg-primary/15",
                )}
                key={item.id}
                onClick={() => {
                  onNavigate(item.id);
                  setSidebarOpen(false);
                }}
                variant={active ? "secondary" : "ghost"}
              >
                <NavIcon
                  aria-hidden
                  className={cn(
                    "h-4 w-4 shrink-0",
                    active ? "text-primary" : "text-muted-foreground",
                  )}
                  strokeWidth={2}
                />
                <span className="truncate">{item.label}</span>
              </Button>
            );
          })}
        </nav>

        <div className="border-t border-border p-3">
          <p className="px-2 text-[0.65rem] text-muted-foreground">
            {operatorContextNote}
          </p>
        </div>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-primary/20 bg-background/90 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/75 md:px-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <Button
                className="shrink-0 border-white/10 bg-black/30 md:hidden"
                onClick={() => setSidebarOpen((open) => !open)}
                size="icon"
                type="button"
                variant="outline"
              >
                <PanelLeft className="h-4 w-4 text-primary" />
                <span className="sr-only">Toggle navigation</span>
              </Button>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  {subtitle}
                </p>
                <h1 className="font-[var(--font-heading)] text-2xl font-semibold tracking-tight text-ink md:text-3xl">
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
              <label className="sr-only" htmlFor="admin-locale">
                {localeLabel}
              </label>
              <select
                aria-label={localeLabel}
                className={cn(nativeControlClass, "w-[120px]")}
                id="admin-locale"
                onChange={(event) =>
                  onLocaleChange(event.currentTarget.value as AppLocale)
                }
                value={locale}
              >
                <option value="en">{localeEnglishLabel}</option>
                <option value="es">{localeSpanishLabel}</option>
              </select>
              <Badge
                className="max-w-[12rem] truncate font-normal"
                title={sessionTitle}
                variant="muted"
              >
                {sessionLabel}
              </Badge>
              <Badge variant={busyKey ? "default" : "outline"}>
                {busyKey ? `${busyPrefixLabel} · ${busyKey}` : readyLabel}
              </Badge>
              <Separator
                className="hidden h-6 sm:block"
                orientation="vertical"
              />
              <Button
                className="gap-2 border-white/10 bg-black/25 hover:bg-black/40"
                onClick={onSignOut}
                size="sm"
                type="button"
                variant="outline"
              >
                <LogOut className="h-4 w-4 text-primary/90" />
                {signOutLabel}
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
