import { useEffect, useRef, useState } from "react";

import type { TelemetryEventName } from "../lib/telemetry";
import type { ThreadRuntimeModel, ThreadRuntimeState } from "./thread-types";

type UseThreadRuntimePresentationInput = {
  rawRuntime: ThreadRuntimeModel;
  onRuntimeTelemetry?: (
    name: TelemetryEventName,
    properties?: Record<string, unknown>,
  ) => void;
};

function statePriority(state: ThreadRuntimeState) {
  switch (state) {
    case "sending":
      return 6;
    case "loading":
      return 5;
    case "matching":
      return 4;
    case "waiting":
      return 3;
    case "ready":
      return 2;
    case "no_match":
      return 1;
    default:
      return 0;
  }
}

export function useThreadRuntimePresentation({
  rawRuntime,
  onRuntimeTelemetry,
}: UseThreadRuntimePresentationInput) {
  const [runtime, setRuntime] = useState<ThreadRuntimeModel>(rawRuntime);

  useEffect(() => {
    if (rawRuntime.state === runtime.state) {
      setRuntime(rawRuntime);
      return;
    }
    if (statePriority(rawRuntime.state) > statePriority(runtime.state)) {
      setRuntime(rawRuntime);
      return;
    }
    const timeout = setTimeout(() => {
      setRuntime(rawRuntime);
    }, 380);
    return () => {
      clearTimeout(timeout);
    };
  }, [rawRuntime, runtime.state]);

  const runtimeSinceRef = useRef<number>(Date.now());
  const prevRuntimeStateRef = useRef<ThreadRuntimeState>(runtime.state);
  useEffect(() => {
    const prev = prevRuntimeStateRef.current;
    const next = runtime.state;
    if (prev === next) {
      return;
    }

    const now = Date.now();
    const elapsedMs = Math.max(0, now - runtimeSinceRef.current);
    onRuntimeTelemetry?.("home_thread_state_duration", {
      durationMs: elapsedMs,
      state: prev,
    });
    onRuntimeTelemetry?.("home_thread_state_transition", {
      from: prev,
      to: next,
    });
    prevRuntimeStateRef.current = next;
    runtimeSinceRef.current = now;
  }, [onRuntimeTelemetry, runtime.state]);

  return runtime;
}
