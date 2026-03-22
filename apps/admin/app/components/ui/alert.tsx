import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/app/lib/cn";

const alertVariants = cva(
  "relative w-full rounded-lg border px-3.5 py-2.5 text-sm leading-snug [&_svg]:absolute [&_svg]:left-4 [&_svg]:top-4 [&_svg]:text-foreground [&_svg~*]:pl-7",
  {
    variants: {
      variant: {
        default: "border-border bg-muted text-foreground",
        success: "border-border bg-muted text-foreground",
        destructive:
          "border-destructive/50 bg-destructive/15 text-foreground [&_svg]:text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, role = "status", ...props }, ref) => (
  <div
    className={cn(alertVariants({ variant }), className)}
    ref={ref}
    role={role}
    {...props}
  />
));
Alert.displayName = "Alert";

export { Alert, alertVariants };
