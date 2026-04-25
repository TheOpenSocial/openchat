import type { Metadata } from "next";
import type { ReactNode } from "react";

import { ProtectedLayoutClient } from "@/src/components/layout/ProtectedLayoutClient";
import { privateMetadata } from "@/src/lib/seo";

export const metadata: Metadata = privateMetadata;

export default function ProtectedLayout({ children }: { children: ReactNode }) {
  return <ProtectedLayoutClient>{children}</ProtectedLayoutClient>;
}
