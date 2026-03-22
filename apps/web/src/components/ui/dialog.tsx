"use client";

import * as React from "react";

import { cn } from "@/src/lib/cn";

export function Dialog({
  children,
  open,
}: {
  children: React.ReactNode;
  open: boolean;
}) {
  if (!open) {
    return null;
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      {children}
    </div>
  );
}

export function DialogContent({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "w-full max-w-md rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-2xl",
        className,
      )}
    >
      {children}
    </div>
  );
}
