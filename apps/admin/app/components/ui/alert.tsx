import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/app/lib/cn";

const alertVariants = cva(
  "relative w-full rounded-xl border px-3.5 py-2.5 text-sm leading-snug shadow-sm shadow-black/20 [&_svg]:absolute [&_svg]:left-4 [&_svg]:top-4 [&_svg]:text-foreground [&_svg~*]:pl-7",
  {
    variants: {
      variant: {
        default: "border-sky-500/45 bg-sky-500/12 text-sky-100",
        success: "border-emerald-500/45 bg-emerald-500/12 text-emerald-100",
        destructive:
          "border-rose-500/45 bg-rose-500/12 text-rose-100 [&_svg]:text-rose-100",
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
