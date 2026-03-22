import * as React from "react";

import { cn } from "@/src/lib/cn";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "primary" | "success" | "danger";
}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold",
        (!variant || variant === "default") &&
          "border-[hsl(var(--border))] bg-white/5 text-white/85",
        variant === "primary" &&
          "border-transparent bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]",
        variant === "success" &&
          "border-emerald-400/30 bg-emerald-400/10 text-emerald-100",
        variant === "danger" &&
          "border-rose-500/30 bg-rose-500/10 text-rose-100",
        className,
      )}
      {...props}
    />
  );
}
