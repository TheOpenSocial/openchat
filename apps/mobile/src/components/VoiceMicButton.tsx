import { speechRecognitionAvailable } from "../lib/speech-recognition-available";

import type { VoiceMicButtonImplProps } from "./VoiceMicButtonImpl";

/**
 * Renders voice dictation when the native speech module is present (dev builds).
 * Returns null in Expo Go so the app can load for Maestro and quick QA.
 */
export function VoiceMicButton(props: VoiceMicButtonImplProps) {
  if (!speechRecognitionAvailable()) {
    return null;
  }

  const { VoiceMicButtonImpl } =
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro resolves .tsx; avoids loading expo-speech when unavailable.
    require("./VoiceMicButtonImpl") as typeof import("./VoiceMicButtonImpl");

  return <VoiceMicButtonImpl {...props} />;
}
