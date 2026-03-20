import type { ApiResponseEnvelope } from "@opensocial/types";
import { getRequestTraceId } from "./request-context.js";

export function ok<T>(data: T, traceId?: string): ApiResponseEnvelope {
  return {
    success: true,
    data,
    traceId: traceId ?? getRequestTraceId() ?? undefined,
  };
}
