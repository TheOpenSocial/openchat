import { WebDesignMockApp } from "@/src/WebDesignMockApp";
import { LandingScreen } from "@/src/features/auth/landing-screen";
import { webEnv } from "@/src/lib/env";

export default function RootPage() {
  if (webEnv.designMock) {
    return <WebDesignMockApp />;
  }

  return <LandingScreen />;
}
