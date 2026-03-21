"use client";

import * as React from "react";

import { cn } from "@/app/lib/cn";
import { nativeControlClass } from "@/app/lib/form-control-classes";

const SelectContext = React.createContext<{
  value?: string;
  onValueChange?: (value: string) => void;
} | null>(null);

function Select({
  value,
  onValueChange,
  children,
}: {
  value?: string;
  onValueChange?: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <SelectContext.Provider value={{ value, onValueChange }}>
      {children}
    </SelectContext.Provider>
  );
}

const SelectTrigger = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => {
  const context = React.useContext(SelectContext);
  return (
    <select
      className={cn(nativeControlClass, "h-8", className)}
      onChange={(event) => {
        props.onChange?.(event);
        context?.onValueChange?.(event.currentTarget.value);
      }}
      ref={ref}
      value={context?.value}
      {...props}
    >
      {children}
    </select>
  );
});
SelectTrigger.displayName = "SelectTrigger";

function SelectContent({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

const SelectItem = React.forwardRef<
  HTMLOptionElement,
  React.OptionHTMLAttributes<HTMLOptionElement> & { value: string }
>(({ className, children, ...props }, ref) => (
  <option className={className} ref={ref} {...props}>
    {children}
  </option>
));
SelectItem.displayName = "SelectItem";

function SelectValue() {
  return null;
}

export { Select, SelectContent, SelectItem, SelectTrigger, SelectValue };
