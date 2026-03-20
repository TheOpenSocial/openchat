import { requireNativeModule } from "expo";

let cached: boolean | null = null;

/** False in Expo Go and other runtimes without the `expo-speech-recognition` native module. */
export function speechRecognitionAvailable(): boolean {
  if (cached !== null) {
    return cached;
  }
  try {
    requireNativeModule("ExpoSpeechRecognition");
    cached = true;
    return true;
  } catch {
    cached = false;
    return false;
  }
}
