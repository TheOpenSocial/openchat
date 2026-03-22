import * as React from "react";

import { cn } from "@/src/lib/cn";

export const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    className={cn(
      "rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--card))]/85 text-[hsl(var(--card-foreground))] shadow-[0_20px_60px_rgba(0,0,0,0.22)] backdrop-blur-sm",
      className,
    )}
    ref={ref}
    {...props}
  />
));
Card.displayName = "Card";

export const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    className={cn("flex flex-col space-y-1.5 p-5 pb-0", className)}
    ref={ref}
    {...props}
  />
));
CardHeader.displayName = "CardHeader";

export const CardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    className={cn(
      "font-[var(--font-heading)] text-lg font-semibold tracking-tight text-[hsl(var(--foreground))]",
      className,
    )}
    ref={ref}
    {...props}
  />
));
CardTitle.displayName = "CardTitle";

export const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    className={cn(
      "text-sm leading-relaxed text-[hsl(var(--muted-foreground))]",
      className,
    )}
    ref={ref}
    {...props}
  />
));
CardDescription.displayName = "CardDescription";

export const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div className={cn("p-5 pt-4", className)} ref={ref} {...props} />
));
CardContent.displayName = "CardContent";

export const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    className={cn("flex items-center p-5 pt-0", className)}
    ref={ref}
    {...props}
  />
));
CardFooter.displayName = "CardFooter";
