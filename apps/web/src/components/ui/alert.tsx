import * as React from "react";

import { cn } from "@/src/lib/cn";

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "success" | "destructive";
}

export function Alert({ className, variant, ...props }: AlertProps) {
  return (
    <div
      className={cn(
        "w-full rounded-[calc(var(--radius)-2px)] border px-3.5 py-3 text-sm leading-relaxed",
        (!variant || variant === "default") &&
          "border-[hsl(var(--border))] bg-white/5 text-[hsl(var(--foreground))]",
        variant === "success" &&
          "border-emerald-400/30 bg-emerald-400/10 text-emerald-100",
        variant === "destructive" &&
          "border-rose-500/30 bg-rose-500/10 text-rose-100",
        className,
      )}
      role="status"
      {...props}
    />
  );
}
