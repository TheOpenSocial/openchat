import type { ReactNode } from "react";

import { cn } from "@/src/lib/cn";

type RouteTransitionProps = {
  animated?: boolean;
  children: ReactNode;
  routeKey: string;
  className?: string;
};

export function RouteTransition({
  animated = true,
  children,
  className,
  routeKey,
}: RouteTransitionProps) {
  if (!animated) {
    return <div className={cn("min-w-0 flex-1", className)}>{children}</div>;
  }

  return (
    <div
      key={routeKey}
      className={cn(
        "min-w-0 flex-1 motion-safe:animate-soft-rise motion-reduce:animate-none",
        className,
      )}
    >
      {children}
    </div>
  );
}
