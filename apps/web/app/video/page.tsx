import type { Metadata } from "next";

import { VideoTranscriptPage } from "@/src/features/auth/video-transcript-page";
import { createPublicMetadata } from "@/src/lib/seo";

export const metadata: Metadata = createPublicMetadata({
  title: "Video to transcript",
  description:
    "Upload a recording and turn it into a clean Markdown transcript with OpenSocial.",
  path: "/video",
});

export default function VideoRoute() {
  return <VideoTranscriptPage />;
}
