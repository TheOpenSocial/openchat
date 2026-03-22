"use client";

import * as React from "react";

import { cn } from "@/src/lib/cn";

export interface SwitchProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type"
> {
  checked?: boolean;
}

export const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  ({ className, ...props }, ref) => (
    <label className={cn("inline-flex cursor-pointer items-center", className)}>
      <input className="peer sr-only" ref={ref} type="checkbox" {...props} />
      <span className="relative h-6 w-11 rounded-full bg-white/15 transition peer-checked:bg-[hsl(var(--accent))]">
        <span className="absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition peer-checked:translate-x-5" />
      </span>
    </label>
  ),
);
Switch.displayName = "Switch";
