"use client";

import * as React from "react";

import { cn } from "@/src/lib/cn";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: "default" | "sm" | "lg" | "icon";
  variant?:
    | "default"
    | "primary"
    | "secondary"
    | "outline"
    | "ghost"
    | "destructive";
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, size, variant, ...props }, ref) => (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[calc(var(--radius)-4px)] text-sm font-medium transition-[background-color,color,border-color,transform,box-shadow,opacity] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent disabled:pointer-events-none disabled:opacity-50 active:scale-[0.99]",
        size === "sm" && "h-8 rounded-xl px-3 text-xs",
        size === "lg" && "h-11 px-5 text-sm",
        size === "icon" && "h-10 w-10",
        (!size || size === "default") && "h-10 px-4 py-2",
        (!variant || variant === "default") &&
          "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:brightness-105",
        variant === "primary" &&
          "bg-[hsl(var(--foreground))] text-[hsl(var(--background))] hover:opacity-90",
        variant === "secondary" &&
          "border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))] hover:bg-[hsl(var(--muted))]",
        variant === "outline" &&
          "border border-[hsl(var(--border))] bg-transparent text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]",
        variant === "ghost" &&
          "text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]",
        variant === "destructive" &&
          "bg-[hsl(var(--destructive))] text-[hsl(var(--destructive-foreground))] hover:opacity-90",
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
);
Button.displayName = "Button";
