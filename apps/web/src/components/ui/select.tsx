import * as React from "react";

import { cn } from "@/src/lib/cn";

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, ...props }, ref) => (
    <select
      className={cn(
        "flex h-10 w-full rounded-[calc(var(--radius)-2px)] border border-[hsl(var(--input))] bg-black/25 px-3 py-2 text-sm text-[hsl(var(--foreground))] outline-none focus-visible:border-[hsl(var(--ring))]",
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
);
Select.displayName = "Select";
