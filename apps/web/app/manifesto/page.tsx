import type { Metadata } from "next";

import { ManifestoPage } from "@/src/features/auth/manifesto-page";

export const metadata: Metadata = {
  title: "Manifesto | OpenSocial",
  description:
    "Why OpenSocial believes social software should begin with intent, consent, and real human connection.",
};

export default function ManifestoRoute() {
  return <ManifestoPage />;
}
