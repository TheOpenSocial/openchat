import * as React from "react";

import { cn } from "@/src/lib/cn";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => (
    <input
      className={cn(
        "flex h-10 w-full rounded-[calc(var(--radius)-2px)] border border-[hsl(var(--input))] bg-black/25 px-3 py-2 text-sm text-[hsl(var(--foreground))] outline-none transition-colors placeholder:text-white/30 focus-visible:border-[hsl(var(--ring))] disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
);
Input.displayName = "Input";
