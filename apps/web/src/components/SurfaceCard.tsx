import type { PropsWithChildren } from "react";

interface SurfaceCardProps extends PropsWithChildren {
  className?: string;
}

export function SurfaceCard({ children, className = "" }: SurfaceCardProps) {
  return (
    <div
      className={`rounded-2xl border border-slate-800 bg-slate-900/90 px-4 py-4 ${className}`}
    >
      {children}
    </div>
  );
}
