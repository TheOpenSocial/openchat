import { Logger } from "@nestjs/common";
import { SpanKind } from "@opentelemetry/api";
import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { recordHttpRequestMetric } from "./ops-metrics.js";
import { redactForLogs } from "./redaction.js";
import { runWithRequestContext } from "./request-context.js";
import {
  markSpanError,
  runWithSpanContext,
  startTraceSpan,
} from "./tracing.js";

const logger = new Logger("HttpRequest");

function readIncomingTraceId(request: Request) {
  const headerValue = request.headers["x-trace-id"];
  const raw = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (typeof raw !== "string") {
    return randomUUID();
  }
  const traceId = raw.trim();
  if (traceId.length === 0 || traceId.length > 128) {
    return randomUUID();
  }
  return traceId;
}

export function requestLoggingMiddleware(
  request: Request,
  response: Response,
  next: NextFunction,
) {
  const traceId = readIncomingTraceId(request);
  const startedAt = Date.now();
  const span = startTraceSpan("http.request", {
    traceId,
    kind: SpanKind.SERVER,
    attributes: {
      "http.method": request.method,
      "http.route": request.path || request.originalUrl,
      "http.target": request.originalUrl,
      "http.client_ip": request.ip ?? null,
    },
  });

  response.setHeader("x-trace-id", traceId);
  (request as Request & { traceId?: string }).traceId = traceId;

  let logged = false;
  let spanEnded = false;
  const logOnFinish = () => {
    if (logged) {
      return;
    }
    logged = true;
    const durationMs = Date.now() - startedAt;
    recordHttpRequestMetric(durationMs, response.statusCode);
    if (!spanEnded) {
      span.setAttribute("http.status_code", response.statusCode);
      span.setAttribute("http.response.duration_ms", durationMs);
      span.end();
      spanEnded = true;
    }
    logger.log(
      JSON.stringify({
        event: "http.request.completed",
        traceId,
        method: request.method,
        path: request.originalUrl,
        statusCode: response.statusCode,
        durationMs,
        request: {
          ip: request.ip ?? null,
          userAgent:
            typeof request.headers["user-agent"] === "string"
              ? request.headers["user-agent"]
              : null,
          query: redactForLogs(request.query),
          params: redactForLogs(request.params),
        },
      }),
    );
  };

  response.once("finish", logOnFinish);
  response.once("close", () => {
    if (!spanEnded) {
      markSpanError(span, new Error("request_closed_before_finish"));
      span.end();
      spanEnded = true;
    }
    logOnFinish();
  });

  runWithRequestContext({ traceId }, () => {
    runWithSpanContext(span, () => {
      next();
    });
  });
}
