import { describe, expect, it } from "vitest";
import { ok } from "../src/common/api-response.js";
import {
  getOpsRuntimeMetricsSnapshot,
  recordHttpRequestMetric,
  recordNotificationDispatch,
  recordNotificationOpened,
  recordOnboardingInferenceMetric,
  recordOpenAIMetric,
  recordQueueJobFailure,
  recordQueueJobProcessing,
  recordQueueJobSkipped,
  recordWebsocketConnectionClosed,
  recordWebsocketConnectionOpened,
  recordWebsocketError,
  resetOpsRuntimeMetrics,
} from "../src/common/ops-metrics.js";
import { redactForLogs } from "../src/common/redaction.js";
import { runWithRequestContext } from "../src/common/request-context.js";
import { extractJobTraceId } from "../src/jobs/job-logging.js";

describe("Observability helpers", () => {
  it("injects request trace id into API envelope when available", () => {
    const response = runWithRequestContext({ traceId: "trace-123" }, () =>
      ok({ hello: "world" }),
    );

    expect(response.traceId).toBe("trace-123");
  });

  it("redacts sensitive values in nested objects", () => {
    const redacted = redactForLogs({
      authorization: "Bearer super-secret",
      email: "user@example.com",
      nested: {
        refreshToken: "secret-refresh",
        safe: "value",
        contact: "Reach me at person@company.com or +1 (555) 123-4567",
      },
    }) as Record<string, unknown>;

    expect(redacted.authorization).toBe("[REDACTED]");
    expect(redacted.email).toBe("[REDACTED]");
    expect((redacted.nested as Record<string, unknown>).refreshToken).toBe(
      "[REDACTED]",
    );
    expect((redacted.nested as Record<string, unknown>).contact).toBe(
      "Reach me at [REDACTED_EMAIL] or [REDACTED_PHONE]",
    );
    expect((redacted.nested as Record<string, unknown>).safe).toBe("value");
  });

  it("extracts trace id from queue envelopes", () => {
    expect(
      extractJobTraceId({
        traceId: "trace-top-level",
      }),
    ).toBe("trace-top-level");

    expect(
      extractJobTraceId({
        payload: {
          traceId: "trace-nested",
        },
      }),
    ).toBe("trace-nested");
  });

  it("tracks runtime metrics for HTTP/websocket/queue and openai operations", () => {
    resetOpsRuntimeMetrics();

    recordHttpRequestMetric(80, 200);
    recordHttpRequestMetric(120, 503);
    recordWebsocketConnectionOpened();
    recordWebsocketConnectionOpened();
    recordWebsocketConnectionClosed();
    recordWebsocketError("invalid_socket_payload");
    recordQueueJobProcessing("intent-processing", 150);
    recordQueueJobSkipped("intent-processing");
    recordQueueJobFailure("intent-processing");
    recordOpenAIMetric({
      operation: "intent_parsing",
      latencyMs: 310,
      ok: true,
      estimatedCostUsd: 0.002,
    });
    recordOnboardingInferenceMetric({
      mode: "fast",
      model: "ministral-3:14b",
      durationMs: 1200,
      unavailable: false,
      fallback: false,
    });
    recordOnboardingInferenceMetric({
      mode: "rich",
      model: "gpt-oss:20b",
      durationMs: 2200,
      unavailable: true,
      fallback: true,
    });

    const snapshot = getOpsRuntimeMetricsSnapshot();
    expect(snapshot.http.requestCount).toBe(2);
    expect(snapshot.http.statusCounts["2xx"]).toBe(1);
    expect(snapshot.http.statusCounts["5xx"]).toBe(1);
    expect(snapshot.websocket.currentConnections).toBe(1);
    expect(snapshot.websocket.totalConnections).toBe(2);
    expect(snapshot.websocket.errors).toBe(1);
    expect(snapshot.queues[0]).toEqual(
      expect.objectContaining({
        queue: "intent-processing",
        processed: 1,
        failed: 1,
        skipped: 1,
      }),
    );
    expect(snapshot.openai.calls).toBe(1);
    expect(snapshot.openai.operations[0]).toEqual(
      expect.objectContaining({
        operation: "intent_parsing",
        calls: 1,
      }),
    );
    expect(snapshot.onboardingInference.calls).toBe(2);
    expect(snapshot.onboardingInference.fallbacks).toBe(1);
    expect(snapshot.onboardingInference.byMode).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ mode: "fast", calls: 1 }),
        expect.objectContaining({ mode: "rich", calls: 1 }),
      ]),
    );
  });

  it("tracks push dispatch/open runtime rates", () => {
    resetOpsRuntimeMetrics();
    recordNotificationDispatch("push");
    recordNotificationDispatch("push");
    recordNotificationOpened("push");

    const snapshot = getOpsRuntimeMetricsSnapshot();
    expect(snapshot.notifications.pushDispatched).toBe(2);
    expect(snapshot.notifications.pushOpened).toBe(1);
    expect(snapshot.notifications.pushOpenRate).toBe(0.5);
  });
});
