import { useCallback } from "react";

import {
  trackTelemetryEvent,
  type TelemetryEventName,
} from "../../../lib/telemetry";

export function useHomeTelemetry(userId: string) {
  const recordTelemetry = useCallback(
    (name: TelemetryEventName, properties?: Record<string, unknown>) => {
      void trackTelemetryEvent(userId, name, properties).catch(() => {});
    },
    [userId],
  );

  return { recordTelemetry };
}
