import { speechRecognitionAvailable } from "../lib/speech-recognition-available";

import type { VoiceMicButtonProps } from "./VoiceMicButton.types";

/**
 * Renders voice dictation when the native speech module is present (dev builds).
 * Returns null in Expo Go so the app can load for Maestro and quick QA.
 */
export function VoiceMicButton(props: VoiceMicButtonProps) {
  if (!speechRecognitionAvailable()) {
    return null;
  }

  try {
    const mod =
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro resolves .tsx; avoids loading expo-speech when unavailable.
      require("./VoiceMicButtonImpl") as typeof import("./VoiceMicButtonImpl");
    const { VoiceMicButtonImpl } = mod;
    if (typeof VoiceMicButtonImpl !== "function") {
      return null;
    }

    return <VoiceMicButtonImpl {...props} />;
  } catch {
    return null;
  }
}
