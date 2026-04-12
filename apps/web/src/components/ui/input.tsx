import * as React from "react";

import { cn } from "@/src/lib/cn";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => (
    <input
      className={cn(
        "flex h-10 w-full rounded-[calc(var(--radius)-2px)] border border-[hsl(var(--input))] bg-[hsl(var(--panel-muted))] px-3 py-2 text-sm text-[hsl(var(--foreground))] outline-none transition-colors placeholder:text-[hsl(var(--muted-foreground))] placeholder:opacity-100 focus-visible:border-[hsl(var(--ring))] focus-visible:bg-[hsl(var(--panel))] disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
);
Input.displayName = "Input";
