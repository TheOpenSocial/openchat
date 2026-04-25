import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { createPublicMetadata, hiddenPublicMetadata } from "@/src/lib/seo";

export const metadata: Metadata = {
  ...createPublicMetadata({
    title: "Video to transcript",
    description:
      "Upload a recording and turn it into a clean Markdown transcript with OpenSocial.",
    path: "/video",
  }),
  robots: hiddenPublicMetadata.robots,
};

export default function VideoRoute() {
  notFound();
}
