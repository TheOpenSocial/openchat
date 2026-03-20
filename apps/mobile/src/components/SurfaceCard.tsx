import { PropsWithChildren } from "react";

import { Card } from "./ui/card";

interface SurfaceCardProps extends PropsWithChildren {
  className?: string;
}

export function SurfaceCard({ children, className = "" }: SurfaceCardProps) {
  return <Card className={`px-4 py-4 ${className}`}>{children}</Card>;
}
