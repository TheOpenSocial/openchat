import { cn } from "@/src/lib/cn";

export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-[calc(var(--radius)-4px)] bg-white/8",
        className,
      )}
      {...props}
    />
  );
}
