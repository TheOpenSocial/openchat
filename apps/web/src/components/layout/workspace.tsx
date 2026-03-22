import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/src/lib/cn";

export function WorkspaceSection({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={cn("space-y-4", className)}>{children}</section>;
}

export function WorkspaceHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex flex-col gap-3 border-b border-[hsl(var(--border))] pb-4 md:flex-row md:items-end md:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="font-[var(--font-heading)] text-[1.05rem] font-semibold tracking-tight text-[hsl(var(--foreground))]">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 max-w-2xl text-sm leading-6 text-[hsl(var(--muted-foreground))]">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

export function WorkspacePanel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[calc(var(--radius)+2px)] border border-[hsl(var(--border))] bg-[hsl(var(--panel))] p-4 shadow-[0_18px_45px_rgba(0,0,0,0.18)] sm:p-5",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function WorkspaceMutedPanel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[calc(var(--radius)-2px)] border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-muted))] p-3.5",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function WorkspaceKicker({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "text-[11px] font-semibold uppercase tracking-[0.22em] text-[hsl(var(--muted-foreground))]",
        className,
      )}
    >
      {children}
    </p>
  );
}

export function WorkspaceList({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("divide-y divide-[hsl(var(--border-soft))]", className)}
      {...props}
    />
  );
}

export function WorkspaceListItem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("py-3 first:pt-0 last:pb-0", className)}>{children}</div>
  );
}
