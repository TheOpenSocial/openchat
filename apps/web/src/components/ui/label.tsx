import * as React from "react";

import { cn } from "@/src/lib/cn";

export type LabelProps = React.LabelHTMLAttributes<HTMLLabelElement>;

export const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, ...props }, ref) => (
    <label
      className={cn(
        "text-[11px] font-semibold uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]",
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
);
Label.displayName = "Label";
