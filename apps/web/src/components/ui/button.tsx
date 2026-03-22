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
          "bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))] hover:brightness-110",
        variant === "primary" &&
          "bg-white text-[#0d0d0d] shadow-[0_12px_32px_rgba(255,255,255,0.12)] hover:bg-white/94 hover:shadow-[0_16px_36px_rgba(255,255,255,0.16)]",
        variant === "secondary" &&
          "border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))] hover:bg-white/10",
        variant === "outline" &&
          "border border-[hsl(var(--border))] bg-transparent text-[hsl(var(--foreground))] hover:bg-white/5",
        variant === "ghost" && "text-[hsl(var(--foreground))] hover:bg-white/5",
        variant === "destructive" &&
          "border border-rose-500/40 bg-rose-500/10 text-rose-100 hover:bg-rose-500/20",
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
);
Button.displayName = "Button";
