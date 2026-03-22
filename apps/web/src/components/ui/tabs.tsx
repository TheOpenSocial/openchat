"use client";

import * as React from "react";

import { cn } from "@/src/lib/cn";

const TabsContext = React.createContext<{
  value: string;
  setValue: (value: string) => void;
} | null>(null);

export function Tabs({
  children,
  defaultValue,
  value,
  onValueChange,
}: {
  children: React.ReactNode;
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
}) {
  const [internal, setInternal] = React.useState(defaultValue ?? "");
  const active = value ?? internal;
  const setValue = (next: string) => {
    if (value === undefined) {
      setInternal(next);
    }
    onValueChange?.(next);
  };
  return (
    <TabsContext.Provider value={{ value: active, setValue }}>
      {children}
    </TabsContext.Provider>
  );
}

export function TabsList({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "inline-flex rounded-[calc(var(--radius)-4px)] border border-[hsl(var(--border))] bg-white/5 p-1",
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({
  className,
  value,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { value: string }) {
  const context = React.useContext(TabsContext);
  const active = context?.value === value;
  return (
    <button
      className={cn(
        "rounded-[calc(var(--radius)-8px)] px-3 py-1.5 text-xs font-semibold transition",
        active
          ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
          : "text-white/65 hover:text-white",
        className,
      )}
      onClick={() => context?.setValue(value)}
      type="button"
      {...props}
    />
  );
}

export function TabsContent({
  className,
  value,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { value: string }) {
  const context = React.useContext(TabsContext);
  if (context?.value !== value) {
    return null;
  }
  return <div className={className} {...props} />;
}
