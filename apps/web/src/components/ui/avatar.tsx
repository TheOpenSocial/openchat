import * as React from "react";

import { cn } from "@/src/lib/cn";

export function Avatar({
  alt,
  className,
  fallback,
  src,
}: {
  alt: string;
  className?: string;
  fallback: string;
  src?: string | null;
}) {
  if (src) {
    return (
      <img
        alt={alt}
        className={cn(
          "h-12 w-12 rounded-full border border-white/10 object-cover",
          className,
        )}
        src={src}
      />
    );
  }

  return (
    <div
      aria-label={alt}
      className={cn(
        "flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/5 text-sm font-semibold text-white/80",
        className,
      )}
    >
      {fallback}
    </div>
  );
}
