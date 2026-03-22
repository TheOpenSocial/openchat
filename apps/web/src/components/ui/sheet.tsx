"use client";

import * as React from "react";

import { cn } from "@/src/lib/cn";

export function Sheet({
  children,
  open,
}: {
  children: React.ReactNode;
  open: boolean;
}) {
  if (!open) {
    return null;
  }
  return <div className="fixed inset-0 z-40 bg-black/50">{children}</div>;
}

export function SheetContent({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "ml-auto h-full w-full max-w-sm border-l border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-2xl",
        className,
      )}
    >
      {children}
    </div>
  );
}
