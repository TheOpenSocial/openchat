/** Shared field styles + button class strings for native controls / bulk actions. */

import { buttonVariants } from "@/app/components/ui/button";
import { nativeControlClass } from "@/app/lib/form-control-classes";

export const adminLabelClass =
  "text-xs font-medium uppercase tracking-wider text-muted-foreground";

export const adminInputClass = nativeControlClass;

export const adminButtonClass = buttonVariants({
  variant: "default",
  size: "sm",
});

export const adminButtonGhostClass = buttonVariants({
  variant: "outline",
  size: "sm",
});

export const adminButtonDangerClass = buttonVariants({
  variant: "destructive",
  size: "sm",
});
