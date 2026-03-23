interface Histogram {
  readonly maxSamples: number;
  samples: number[];
  count: number;
  total: number;
  max: number;
}

interface QueueMetricState {
  processed: number;
  failed: number;
  skipped: number;
  lagMs: Histogram;
}

interface OpenAIOperationState {
  calls: number;
  errors: number;
  totalLatencyMs: number;
  totalEstimatedCostUsd: number;
}

interface OnboardingInferenceState {
  calls: number;
  unavailable: number;
  fallbacks: number;
  latencyMs: Histogram;
}

const DEFAULT_HISTOGRAM_SAMPLE_SIZE = 500;

const state = {
  http: {
    latencyMs: createHistogram(),
    statusCounts: {
      "2xx": 0,
      "3xx": 0,
      "4xx": 0,
      "5xx": 0,
      other: 0,
    },
  },
  websocket: {
    currentConnections: 0,
    peakConnections: 0,
    totalConnections: 0,
    disconnects: 0,
    errors: 0,
    errorsByCode: new Map<string, number>(),
  },
  queues: new Map<string, QueueMetricState>(),
  openai: {
    calls: 0,
    errors: 0,
    totalLatencyMs: 0,
    totalEstimatedCostUsd: 0,
    byOperation: new Map<string, OpenAIOperationState>(),
  },
  notifications: {
    pushDispatched: 0,
    pushOpened: 0,
  },
  onboardingInference: {
    calls: 0,
    unavailable: 0,
    fallbacks: 0,
    latencyMs: createHistogram(),
    byMode: new Map<string, OnboardingInferenceState>(),
    byModel: new Map<string, OnboardingInferenceState>(),
  },
};

export function recordHttpRequestMetric(
  durationMs: number,
  statusCode: number,
) {
  recordHistogramSample(state.http.latencyMs, durationMs);
  if (statusCode >= 200 && statusCode < 300) {
    state.http.statusCounts["2xx"] += 1;
    return;
  }
  if (statusCode >= 300 && statusCode < 400) {
    state.http.statusCounts["3xx"] += 1;
    return;
  }
  if (statusCode >= 400 && statusCode < 500) {
    state.http.statusCounts["4xx"] += 1;
    return;
  }
  if (statusCode >= 500 && statusCode < 600) {
    state.http.statusCounts["5xx"] += 1;
    return;
  }
  state.http.statusCounts.other += 1;
}

export function recordWebsocketConnectionOpened() {
  state.websocket.totalConnections += 1;
  state.websocket.currentConnections += 1;
  state.websocket.peakConnections = Math.max(
    state.websocket.peakConnections,
    state.websocket.currentConnections,
  );
}

export function recordWebsocketConnectionClosed() {
  state.websocket.currentConnections = Math.max(
    0,
    state.websocket.currentConnections - 1,
  );
  state.websocket.disconnects += 1;
}

export function recordWebsocketError(code: string) {
  state.websocket.errors += 1;
  const existing = state.websocket.errorsByCode.get(code) ?? 0;
  state.websocket.errorsByCode.set(code, existing + 1);
}

export function recordQueueJobProcessing(queueName: string, lagMs = 0) {
  const queue = ensureQueueState(queueName);
  queue.processed += 1;
  recordHistogramSample(queue.lagMs, lagMs);
}

export function recordQueueJobFailure(queueName: string) {
  const queue = ensureQueueState(queueName);
  queue.failed += 1;
}

export function recordQueueJobSkipped(queueName: string) {
  const queue = ensureQueueState(queueName);
  queue.skipped += 1;
}

export function recordOpenAIMetric(input: {
  operation: string;
  latencyMs: number;
  ok: boolean;
  estimatedCostUsd?: number;
}) {
  const operation = ensureOpenAIOperationState(input.operation);
  operation.calls += 1;
  operation.totalLatencyMs += Math.max(0, input.latencyMs);
  const cost = Math.max(0, input.estimatedCostUsd ?? 0);
  operation.totalEstimatedCostUsd += cost;
  if (!input.ok) {
    operation.errors += 1;
  }

  state.openai.calls += 1;
  state.openai.totalLatencyMs += Math.max(0, input.latencyMs);
  state.openai.totalEstimatedCostUsd += cost;
  if (!input.ok) {
    state.openai.errors += 1;
  }
}

export function recordNotificationDispatch(channel: string) {
  if (channel === "push") {
    state.notifications.pushDispatched += 1;
  }
}

export function recordNotificationOpened(channel: string) {
  if (channel === "push") {
    state.notifications.pushOpened += 1;
  }
}

export function recordOnboardingInferenceMetric(input: {
  mode: "fast" | "rich";
  model: string;
  durationMs: number;
  unavailable: boolean;
  fallback: boolean;
}) {
  const normalizedModel = input.model.trim() || "unknown";
  const modeState = ensureOnboardingInferenceState(
    state.onboardingInference.byMode,
    input.mode,
  );
  const modelState = ensureOnboardingInferenceState(
    state.onboardingInference.byModel,
    normalizedModel,
  );
  const targets = [state.onboardingInference, modeState, modelState];
  for (const target of targets) {
    target.calls += 1;
    if (input.unavailable) {
      target.unavailable += 1;
    }
    if (input.fallback) {
      target.fallbacks += 1;
    }
    recordHistogramSample(target.latencyMs, input.durationMs);
  }
}

export function getOpsRuntimeMetricsSnapshot() {
  const httpRequestCount = state.http.latencyMs.count;
  const queueMetrics = Array.from(state.queues.entries()).map(
    ([queue, queueState]) => {
      const lagMs = summarizeHistogram(queueState.lagMs);
      const attempts = queueState.processed + queueState.failed;
      return {
        queue,
        processed: queueState.processed,
        failed: queueState.failed,
        skipped: queueState.skipped,
        failureRate: attempts === 0 ? 0 : queueState.failed / attempts,
        lagMs,
      };
    },
  );

  const openAIOperations = Array.from(state.openai.byOperation.entries()).map(
    ([operation, operationState]) => ({
      operation,
      calls: operationState.calls,
      errors: operationState.errors,
      errorRate:
        operationState.calls === 0
          ? 0
          : operationState.errors / operationState.calls,
      avgLatencyMs:
        operationState.calls === 0
          ? 0
          : operationState.totalLatencyMs / operationState.calls,
      totalEstimatedCostUsd: operationState.totalEstimatedCostUsd,
    }),
  );

  return {
    http: {
      requestCount: httpRequestCount,
      statusCounts: {
        ...state.http.statusCounts,
      },
      latencyMs: summarizeHistogram(state.http.latencyMs),
    },
    websocket: {
      currentConnections: state.websocket.currentConnections,
      peakConnections: state.websocket.peakConnections,
      totalConnections: state.websocket.totalConnections,
      disconnects: state.websocket.disconnects,
      errors: state.websocket.errors,
      errorRate:
        state.websocket.totalConnections === 0
          ? 0
          : state.websocket.errors / state.websocket.totalConnections,
      errorsByCode: Array.from(state.websocket.errorsByCode.entries()).map(
        ([code, count]) => ({
          code,
          count,
        }),
      ),
    },
    queues: queueMetrics,
    openai: {
      calls: state.openai.calls,
      errors: state.openai.errors,
      errorRate:
        state.openai.calls === 0 ? 0 : state.openai.errors / state.openai.calls,
      avgLatencyMs:
        state.openai.calls === 0
          ? 0
          : state.openai.totalLatencyMs / state.openai.calls,
      totalEstimatedCostUsd: state.openai.totalEstimatedCostUsd,
      operations: openAIOperations,
    },
    notifications: {
      pushDispatched: state.notifications.pushDispatched,
      pushOpened: state.notifications.pushOpened,
      pushOpenRate:
        state.notifications.pushDispatched === 0
          ? 0
          : state.notifications.pushOpened / state.notifications.pushDispatched,
    },
    onboardingInference: {
      calls: state.onboardingInference.calls,
      unavailable: state.onboardingInference.unavailable,
      unavailableRate:
        state.onboardingInference.calls === 0
          ? 0
          : state.onboardingInference.unavailable / state.onboardingInference.calls,
      fallbacks: state.onboardingInference.fallbacks,
      fallbackRate:
        state.onboardingInference.calls === 0
          ? 0
          : state.onboardingInference.fallbacks / state.onboardingInference.calls,
      latencyMs: summarizeHistogram(state.onboardingInference.latencyMs),
      byMode: Array.from(state.onboardingInference.byMode.entries()).map(
        ([mode, modeState]) => ({
          mode,
          calls: modeState.calls,
          unavailable: modeState.unavailable,
          unavailableRate:
            modeState.calls === 0 ? 0 : modeState.unavailable / modeState.calls,
          fallbacks: modeState.fallbacks,
          fallbackRate:
            modeState.calls === 0 ? 0 : modeState.fallbacks / modeState.calls,
          latencyMs: summarizeHistogram(modeState.latencyMs),
        }),
      ),
      byModel: Array.from(state.onboardingInference.byModel.entries()).map(
        ([model, modelState]) => ({
          model,
          calls: modelState.calls,
          unavailable: modelState.unavailable,
          unavailableRate:
            modelState.calls === 0
              ? 0
              : modelState.unavailable / modelState.calls,
          fallbacks: modelState.fallbacks,
          fallbackRate:
            modelState.calls === 0 ? 0 : modelState.fallbacks / modelState.calls,
          latencyMs: summarizeHistogram(modelState.latencyMs),
        }),
      ),
    },
  };
}

export function resetOpsRuntimeMetrics() {
  state.http.latencyMs = createHistogram();
  state.http.statusCounts = {
    "2xx": 0,
    "3xx": 0,
    "4xx": 0,
    "5xx": 0,
    other: 0,
  };
  state.websocket.currentConnections = 0;
  state.websocket.peakConnections = 0;
  state.websocket.totalConnections = 0;
  state.websocket.disconnects = 0;
  state.websocket.errors = 0;
  state.websocket.errorsByCode.clear();
  state.queues.clear();
  state.openai.calls = 0;
  state.openai.errors = 0;
  state.openai.totalLatencyMs = 0;
  state.openai.totalEstimatedCostUsd = 0;
  state.openai.byOperation.clear();
  state.notifications.pushDispatched = 0;
  state.notifications.pushOpened = 0;
  state.onboardingInference.calls = 0;
  state.onboardingInference.unavailable = 0;
  state.onboardingInference.fallbacks = 0;
  state.onboardingInference.latencyMs = createHistogram();
  state.onboardingInference.byMode.clear();
  state.onboardingInference.byModel.clear();
}

function createHistogram(
  maxSamples = DEFAULT_HISTOGRAM_SAMPLE_SIZE,
): Histogram {
  return {
    maxSamples,
    samples: [],
    count: 0,
    total: 0,
    max: 0,
  };
}

function recordHistogramSample(histogram: Histogram, value: number) {
  const normalized = Number.isFinite(value) ? Math.max(0, value) : 0;
  histogram.count += 1;
  histogram.total += normalized;
  histogram.max = Math.max(histogram.max, normalized);
  histogram.samples.push(normalized);
  if (histogram.samples.length > histogram.maxSamples) {
    histogram.samples.shift();
  }
}

function summarizeHistogram(histogram: Histogram) {
  if (histogram.count === 0 || histogram.samples.length === 0) {
    return {
      avgMs: 0,
      p50Ms: 0,
      p95Ms: 0,
      maxMs: 0,
      sampleCount: 0,
    };
  }
  const sorted = [...histogram.samples].sort((a, b) => a - b);
  return {
    avgMs: histogram.total / histogram.count,
    p50Ms: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    maxMs: histogram.max,
    sampleCount: histogram.samples.length,
  };
}

function percentile(sortedValues: number[], percentileRank: number) {
  if (sortedValues.length === 0) {
    return 0;
  }
  const index = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.ceil(sortedValues.length * percentileRank) - 1),
  );
  return sortedValues[index];
}

function ensureQueueState(queueName: string): QueueMetricState {
  const existing = state.queues.get(queueName);
  if (existing) {
    return existing;
  }
  const created: QueueMetricState = {
    processed: 0,
    failed: 0,
    skipped: 0,
    lagMs: createHistogram(),
  };
  state.queues.set(queueName, created);
  return created;
}

function ensureOpenAIOperationState(
  operationName: string,
): OpenAIOperationState {
  const existing = state.openai.byOperation.get(operationName);
  if (existing) {
    return existing;
  }
  const created: OpenAIOperationState = {
    calls: 0,
    errors: 0,
    totalLatencyMs: 0,
    totalEstimatedCostUsd: 0,
  };
  state.openai.byOperation.set(operationName, created);
  return created;
}

function ensureOnboardingInferenceState(
  target: Map<string, OnboardingInferenceState>,
  key: string,
): OnboardingInferenceState {
  const existing = target.get(key);
  if (existing) {
    return existing;
  }
  const created: OnboardingInferenceState = {
    calls: 0,
    unavailable: 0,
    fallbacks: 0,
    latencyMs: createHistogram(),
  };
  target.set(key, created);
  return created;
}
