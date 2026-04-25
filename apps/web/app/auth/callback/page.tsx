import type { Metadata } from "next";

import { WebAuthCallbackPage } from "@/src/features/auth/web-auth-callback-page";
import { privateMetadata } from "@/src/lib/seo";

export const metadata: Metadata = privateMetadata;

export default function AuthCallbackRoute() {
  return <WebAuthCallbackPage />;
}
