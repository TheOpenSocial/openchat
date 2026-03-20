import {
  SpanKind,
  SpanStatusCode,
  context,
  trace,
  type Span,
} from "@opentelemetry/api";

type TraceAttributeValue = string | number | boolean | null | undefined;

interface TraceSpanOptions {
  traceId?: string;
  kind?: SpanKind;
  attributes?: Record<string, TraceAttributeValue>;
}

const tracer = trace.getTracer("opensocial-api");

export function startTraceSpan(name: string, options: TraceSpanOptions = {}) {
  const span = tracer.startSpan(name, {
    kind: options.kind,
  });
  if (options.traceId) {
    span.setAttribute("app.trace_id", options.traceId);
  }
  if (options.attributes) {
    setSpanAttributes(span, options.attributes);
  }
  return span;
}

export function runWithSpanContext<T>(span: Span, fn: () => T) {
  return context.with(trace.setSpan(context.active(), span), fn);
}

export async function runInTraceSpan<T>(
  name: string,
  options: TraceSpanOptions,
  fn: () => Promise<T> | T,
): Promise<T> {
  const span = startTraceSpan(name, options);
  try {
    const result = await runWithSpanContext(span, () => Promise.resolve(fn()));
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : "unknown_error",
    });
    throw error;
  } finally {
    span.end();
  }
}

export function markSpanError(span: Span, error: unknown) {
  span.setStatus({
    code: SpanStatusCode.ERROR,
    message: error instanceof Error ? error.message : "unknown_error",
  });
}

export function activeSpanContext() {
  const span = trace.getSpan(context.active());
  if (!span) {
    return null;
  }
  return span.spanContext();
}

function setSpanAttributes(
  span: Span,
  attributes: Record<string, TraceAttributeValue>,
) {
  for (const [key, value] of Object.entries(attributes)) {
    if (value === undefined || value === null) {
      continue;
    }
    span.setAttribute(key, value);
  }
}
