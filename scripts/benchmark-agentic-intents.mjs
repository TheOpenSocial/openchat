#!/usr/bin/env node
/**
 * Local benchmark for agentic intent behavior.
 *
 * What it measures:
 * 1) API acknowledge latency for POST /api/intents/from-agent
 * 2) Whether an immediate non-user thread update appears (agent/workflow)
 * 3) Whether a background non-user follow-up appears after the ack window
 *
 * Required env:
 * - AGENTIC_BENCH_ACCESS_TOKEN
 * - AGENTIC_BENCH_USER_ID
 * - AGENTIC_BENCH_THREAD_ID
 *
 * Optional env:
 * - AGENTIC_BENCH_URL (default: http://localhost:3000)
 * - AGENTIC_BENCH_RUNS (default: 5)
 * - AGENTIC_BENCH_DELAY_MS (default: 750)
 * - AGENTIC_BENCH_ACK_SLO_MS (default: 1800)
 * - AGENTIC_BENCH_BACKGROUND_WAIT_MS (default: 30000)
 * - AGENTIC_BENCH_POLL_MS (default: 1200)
 * - AGENTIC_BENCH_DATASET (default: apps/api/test/fixtures/agentic-scenarios.json)
 * - AGENTIC_BENCH_ARTIFACT_PATH (optional JSON artifact output)
 * - AGENTIC_BENCH_CONCURRENCY (default: 1)
 * - AGENTIC_BENCH_BURST_SIZE (default: 1)
 * - AGENTIC_BENCH_THREAD_IDS (optional comma-separated thread ids, one per worker lane)
 * - AGENTIC_BENCH_USE_UNIQUE_IP (default: true for localhost)
 * - AGENTIC_BENCH_MIN_ACK_WITHIN_SLO_RATE (default: 1)
 * - AGENTIC_BENCH_MIN_BACKGROUND_FOLLOWUP_RATE (default: 0.8)
 * - AGENTIC_BENCH_MAX_DEGRADED_RATE (default: 0.2)
 * - AGENTIC_BENCH_MAX_DUPLICATE_SIDE_EFFECT_RATE (default: 0)
 * - AGENTIC_BENCH_MAX_QUEUE_LAG_MS (default: 6000)
 * - AGENTIC_BENCH_ENABLE_WORKFLOW_HEALTH (default: 0)
 * - AGENTIC_BENCH_REQUIRE_WORKFLOW_HEALTH (default: 0)
 * - AGENTIC_BENCH_ADMIN_USER_ID (required when workflow health is enabled)
 * - AGENTIC_BENCH_ADMIN_ROLE (default: support)
 * - AGENTIC_BENCH_ADMIN_API_KEY (optional)
 * - AGENTIC_BENCH_WORKFLOW_HEALTH_LIMIT (default: 30)
 * - AGENTIC_BENCH_MAX_CRITICAL_WORKFLOW_RUNS (default: 0)
 * - AGENTIC_BENCH_MAX_FAILED_STAGE_COUNT (default: 0)
 * - AGENTIC_BENCH_MAX_BLOCKED_STAGE_COUNT (default: 0)
 * - AGENTIC_BENCH_MAX_OBSERVABILITY_GAP_RUNS (default: 0)
 */
import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = (process.env.AGENTIC_BENCH_URL ?? "http://localhost:3000").replace(
  /\/$/,
  "",
);
const accessToken = process.env.AGENTIC_BENCH_ACCESS_TOKEN ?? "";
const userId = process.env.AGENTIC_BENCH_USER_ID ?? "";
const threadId = process.env.AGENTIC_BENCH_THREAD_ID ?? "";
const runs = Number(process.env.AGENTIC_BENCH_RUNS ?? 5);
const delayMs = Number(process.env.AGENTIC_BENCH_DELAY_MS ?? 750);
const ackSloMs = Number(process.env.AGENTIC_BENCH_ACK_SLO_MS ?? 1800);
const bgWaitMs = Number(process.env.AGENTIC_BENCH_BACKGROUND_WAIT_MS ?? 30000);
const pollMs = Number(process.env.AGENTIC_BENCH_POLL_MS ?? 1200);
const concurrency = Math.max(1, Number(process.env.AGENTIC_BENCH_CONCURRENCY ?? 1));
const burstSize = Math.max(1, Number(process.env.AGENTIC_BENCH_BURST_SIZE ?? 1));
const artifactPath = process.env.AGENTIC_BENCH_ARTIFACT_PATH?.trim() ?? "";
const minAckWithinSloRate = Number(
  process.env.AGENTIC_BENCH_MIN_ACK_WITHIN_SLO_RATE ?? 1,
);
const minBackgroundFollowupRate = Number(
  process.env.AGENTIC_BENCH_MIN_BACKGROUND_FOLLOWUP_RATE ?? 0.8,
);
const maxDegradedRate = Number(process.env.AGENTIC_BENCH_MAX_DEGRADED_RATE ?? 0.2);
const maxDuplicateSideEffectRate = Number(
  process.env.AGENTIC_BENCH_MAX_DUPLICATE_SIDE_EFFECT_RATE ?? 0,
);
const maxQueueLagMs = Number(process.env.AGENTIC_BENCH_MAX_QUEUE_LAG_MS ?? 6000);
const enableWorkflowHealth =
  (process.env.AGENTIC_BENCH_ENABLE_WORKFLOW_HEALTH ?? "0") === "1";
const requireWorkflowHealth =
  (process.env.AGENTIC_BENCH_REQUIRE_WORKFLOW_HEALTH ?? "0") === "1";
const workflowHealthLimit = Number(
  process.env.AGENTIC_BENCH_WORKFLOW_HEALTH_LIMIT ?? 30,
);
const maxCriticalWorkflowRuns = Number(
  process.env.AGENTIC_BENCH_MAX_CRITICAL_WORKFLOW_RUNS ?? 0,
);
const maxFailedStageCount = Number(
  process.env.AGENTIC_BENCH_MAX_FAILED_STAGE_COUNT ?? 0,
);
const maxBlockedStageCount = Number(
  process.env.AGENTIC_BENCH_MAX_BLOCKED_STAGE_COUNT ?? 0,
);
const maxObservabilityGapRuns = Number(
  process.env.AGENTIC_BENCH_MAX_OBSERVABILITY_GAP_RUNS ?? 0,
);
const adminUserId = process.env.AGENTIC_BENCH_ADMIN_USER_ID ?? "";
const adminRole = process.env.AGENTIC_BENCH_ADMIN_ROLE ?? "support";
const adminApiKey = process.env.AGENTIC_BENCH_ADMIN_API_KEY ?? "";
const datasetPath =
  process.env.AGENTIC_BENCH_DATASET ??
  path.resolve(process.cwd(), "apps/api/test/fixtures/agentic-scenarios.json");
const threadIds = (() => {
  const configured = process.env.AGENTIC_BENCH_THREAD_IDS
    ?.split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  if (configured && configured.length > 0) {
    return configured;
  }
  return threadId ? [threadId] : [];
})();
const useUniqueForwardedIp =
  process.env.AGENTIC_BENCH_USE_UNIQUE_IP === "false"
    ? false
    : /^(http:\/\/localhost|http:\/\/127\.0\.0\.1)/.test(baseUrl);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function percentile(values, p) {
  if (!values.length) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[index];
}

function unwrapResponse(payload) {
  if (payload && typeof payload === "object") {
    if ("data" in payload && payload.data && typeof payload.data === "object") {
      return payload.data;
    }
  }
  return payload;
}

async function requestJson(pathname, init = {}) {
  const headers = {
    "content-type": "application/json",
    authorization: `Bearer ${accessToken}`,
    ...(init.headers ?? {}),
  };

  const response = await fetch(`${baseUrl}${pathname}`, {
    ...init,
    headers,
  });

  const text = await response.text();
  const json = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status} ${response.statusText} on ${pathname}: ${text.slice(0, 300)}`,
    );
  }
  return unwrapResponse(json);
}

async function fetchWorkflowHealthSnapshot() {
  if (!enableWorkflowHealth) {
    return {
      status: "skipped",
      reason: "workflow health disabled",
    };
  }
  if (!adminUserId.trim()) {
    return {
      status: requireWorkflowHealth ? "failed" : "skipped",
      reason: "missing AGENTIC_BENCH_ADMIN_USER_ID",
    };
  }

  const query = new URLSearchParams({
    limit: String(Math.max(1, Math.floor(workflowHealthLimit))),
  });

  try {
    const summary = await requestJson(`/api/admin/ops/agent-workflows?${query.toString()}`, {
      method: "GET",
      headers: {
        "x-admin-user-id": adminUserId.trim(),
        "x-admin-role": adminRole.trim() || "support",
        ...(adminApiKey.trim() ? { "x-admin-api-key": adminApiKey.trim() } : {}),
      },
    });
    const health = summary?.summary?.health ?? {};
    const stageStatusCounts = summary?.summary?.stageStatusCounts ?? {};
    const failureClasses = summary?.summary?.failureClasses ?? {};
    const criticalRuns = Number(health.critical ?? 0);
    const failedStages = Number(stageStatusCounts.failed ?? 0);
    const blockedStages = Number(stageStatusCounts.blocked ?? 0);
    const observabilityGapRuns = Number(failureClasses.observabilityGap ?? 0);
    const pass =
      criticalRuns <= maxCriticalWorkflowRuns &&
      failedStages <= maxFailedStageCount &&
      blockedStages <= maxBlockedStageCount &&
      observabilityGapRuns <= maxObservabilityGapRuns;

    return {
      status: pass ? "passed" : "failed",
      reason: pass
        ? "workflow health is within configured thresholds"
        : "workflow health thresholds breached",
      totalRuns: Number(summary?.summary?.totalRuns ?? 0),
      health,
      stageStatusCounts,
      failureClasses,
      thresholds: {
        maxCriticalWorkflowRuns,
        maxFailedStageCount,
        maxBlockedStageCount,
        maxObservabilityGapRuns,
      },
    };
  } catch (error) {
    return {
      status: requireWorkflowHealth ? "failed" : "skipped",
      reason:
        error instanceof Error
          ? `workflow health request failed: ${error.message}`
          : "workflow health request failed",
    };
  }
}

function isNonUserMessage(message) {
  return message?.role === "agent" || message?.role === "workflow";
}

function summarizeMessage(message) {
  const body = String(message?.content ?? message?.body ?? "").trim();
  return body.length > 96 ? `${body.slice(0, 96)}...` : body;
}

async function loadDataset() {
  const raw = await fs.readFile(datasetPath, "utf8");
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) {
    const entries = parsed
      .map((item, index) => {
        if (typeof item === "string") {
          return {
            scenarioId: `legacy_benchmark_case_${index + 1}`,
            prompt: item.trim(),
          };
        }
        if (
          item &&
          typeof item === "object" &&
          typeof item.prompt === "string" &&
          typeof item.scenarioId === "string"
        ) {
          return {
            scenarioId: item.scenarioId,
            prompt: item.prompt.trim(),
          };
        }
        return null;
      })
      .filter((item) => item && item.prompt);
    if (entries.length === 0) {
      throw new Error(`Dataset must contain benchmark prompts: ${datasetPath}`);
    }
    return entries;
  }

  if (parsed && typeof parsed === "object" && Array.isArray(parsed.scenarios)) {
    const entries = parsed.scenarios
      .filter(
        (scenario) =>
          Array.isArray(scenario.layerTargets) &&
          scenario.layerTargets.includes("benchmark"),
      )
      .map((scenario) => ({
        scenarioId: String(scenario.id),
        prompt: String(scenario.utterance ?? "").trim(),
      }))
      .filter((item) => item.prompt);
    if (entries.length === 0) {
      throw new Error(
        `Scenario corpus does not contain benchmark-targeted scenarios: ${datasetPath}`,
      );
    }
    return entries;
  }

  throw new Error(`Dataset must be a non-empty array or canonical scenario corpus: ${datasetPath}`);
}

function buildForwardedIp(runNumber, workerIndex, burstIndex) {
  const thirdOctet = 10 + ((workerIndex + burstIndex) % 200);
  const fourthOctet = 10 + (runNumber % 200);
  return `198.51.${thirdOctet}.${fourthOctet}`;
}

function normalizeMessageContent(message) {
  const raw = String(message?.content ?? message?.body ?? "").trim().toLowerCase();
  return raw.replace(/\s+/g, " ");
}

function countDuplicateVisibleSideEffects(messages) {
  const counts = new Map();
  for (const message of messages) {
    const key = normalizeMessageContent(message);
    if (!key) {
      continue;
    }
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let duplicates = 0;
  for (const value of counts.values()) {
    if (value > 1) {
      duplicates += value - 1;
    }
  }
  return duplicates;
}

async function runOne(index, scenario, options) {
  const {
    workerIndex,
    burstIndex,
    threadId: selectedThreadId,
  } = options;
  const { scenarioId, prompt } = scenario;
  const forwardedFor = useUniqueForwardedIp
    ? buildForwardedIp(index + 1, workerIndex, burstIndex)
    : null;
  const requestHeaders = forwardedFor
    ? { "x-forwarded-for": forwardedFor }
    : undefined;
  const beforeMessages = await requestJson(
    `/api/agent/threads/${selectedThreadId}/messages`,
    requestHeaders ? { headers: requestHeaders } : {},
  );
  const beforeCount = beforeMessages.length;
  const startedAt = Date.now();

  const createIntentResult = await requestJson("/api/intents/from-agent", {
    method: "POST",
    ...(requestHeaders ? { headers: requestHeaders } : {}),
    body: JSON.stringify({
      threadId: selectedThreadId,
      userId,
      content: prompt,
      allowDecomposition: true,
      maxIntents: 3,
    }),
  });

  const ackLatencyMs = Date.now() - startedAt;
  const intentId = createIntentResult?.intentId ?? null;

  let ackMessage = null;
  let ackDetectedAt = null;

  const ackDetectionDeadline = Date.now() + Math.max(1500, Math.floor(ackSloMs * 2));
  while (Date.now() < ackDetectionDeadline) {
    const current = await requestJson(
      `/api/agent/threads/${selectedThreadId}/messages`,
      requestHeaders ? { headers: requestHeaders } : {},
    );
    const newlyAdded = current.slice(beforeCount);
    const nonUser = newlyAdded.find(isNonUserMessage);
    if (nonUser) {
      ackMessage = nonUser;
      ackDetectedAt = Date.now();
      break;
    }
    await sleep(pollMs);
  }

  let backgroundMessage = null;
  let nonUserMessages = [];
  const backgroundDeadline = Date.now() + bgWaitMs;
  while (Date.now() < backgroundDeadline) {
    const current = await requestJson(
      `/api/agent/threads/${selectedThreadId}/messages`,
      requestHeaders ? { headers: requestHeaders } : {},
    );
    const newlyAdded = current.slice(beforeCount);
    nonUserMessages = newlyAdded.filter(isNonUserMessage);
    if (nonUserMessages.length >= 2) {
      backgroundMessage = nonUserMessages[nonUserMessages.length - 1];
      break;
    }
    await sleep(pollMs);
  }
  if (nonUserMessages.length === 0) {
    const current = await requestJson(
      `/api/agent/threads/${selectedThreadId}/messages`,
      requestHeaders ? { headers: requestHeaders } : {},
    );
    nonUserMessages = current.slice(beforeCount).filter(isNonUserMessage);
  }
  const duplicateVisibleSideEffects = countDuplicateVisibleSideEffects(
    nonUserMessages,
  );
  const queueLagMs =
    ackDetectedAt === null ? null : Math.max(0, ackDetectedAt - startedAt - ackLatencyMs);

  return {
    run: index + 1,
    workerIndex,
    burstIndex,
    scenarioId,
    threadId: selectedThreadId,
    prompt,
    intentId,
    ackLatencyMs,
    ackWithinSlo: ackLatencyMs <= ackSloMs,
    ackMessage,
    ackDetectedMs:
      ackDetectedAt === null ? null : Math.max(0, ackDetectedAt - startedAt),
    queueLagMs,
    duplicateVisibleSideEffects,
    backgroundFollowupDetected: Boolean(backgroundMessage),
    backgroundMessage,
  };
}

async function runBurst(batch, burstIndex, runStartOffset) {
  const results = [];
  const maxWorkers = Math.max(1, Math.min(concurrency, batch.length));
  let cursor = 0;

  const workers = Array.from({ length: maxWorkers }, async (_, workerCursor) => {
    const workerIndex = workerCursor + 1;
    while (cursor < batch.length) {
      const localIndex = cursor;
      cursor += 1;
      const scenario = batch[localIndex];
      const selectedThreadId =
        threadIds[(workerIndex - 1) % Math.max(1, threadIds.length)];
      if (!selectedThreadId) {
        throw new Error(
          "No thread id available for benchmark worker. Set AGENTIC_BENCH_THREAD_ID or AGENTIC_BENCH_THREAD_IDS.",
        );
      }
      const result = await runOne(runStartOffset + localIndex, scenario, {
        workerIndex,
        burstIndex,
        threadId: selectedThreadId,
      });
      results.push(result);
      console.log(
        `[run ${result.run}] worker=${result.workerIndex} burst=${result.burstIndex} scenario=${result.scenarioId} ack=${result.ackLatencyMs}ms (${result.ackWithinSlo ? "within_slo" : "over_slo"}) ` +
          `queueLag=${result.queueLagMs ?? "n/a"}ms duplicates=${result.duplicateVisibleSideEffects} ` +
          `ackMessage="${summarizeMessage(result.ackMessage)}" backgroundFollowup=${result.backgroundFollowupDetected ? "yes" : "no"}`,
      );
    }
  });

  await Promise.all(workers);
  return results.sort((left, right) => left.run - right.run);
}

async function main() {
  if (!accessToken || !userId || threadIds.length === 0) {
    throw new Error(
      "Missing required env. Set AGENTIC_BENCH_ACCESS_TOKEN, AGENTIC_BENCH_USER_ID, and AGENTIC_BENCH_THREAD_ID (or AGENTIC_BENCH_THREAD_IDS).",
    );
  }

  const dataset = await loadDataset();
  const selectedRuns = Math.max(1, Math.min(runs, dataset.length));
  const scenarios = dataset.slice(0, selectedRuns);

  console.log("agentic benchmark starting");
  console.log(`- url: ${baseUrl}`);
  console.log(`- runs: ${selectedRuns}`);
  console.log(`- ackSloMs: ${ackSloMs}`);
  console.log(`- backgroundWaitMs: ${bgWaitMs}`);
  console.log(`- pollMs: ${pollMs}`);
  console.log(`- concurrency: ${concurrency}`);
  console.log(`- burstSize: ${burstSize}`);
  console.log(`- workerThreadIds: ${threadIds.length}`);
  console.log(`- useUniqueForwardedIp: ${useUniqueForwardedIp}`);
  console.log(`- minAckWithinSloRate: ${minAckWithinSloRate}`);
  console.log(`- minBackgroundFollowupRate: ${minBackgroundFollowupRate}`);
  console.log(`- maxDegradedRate: ${maxDegradedRate}`);
  console.log(`- maxDuplicateSideEffectRate: ${maxDuplicateSideEffectRate}`);
  console.log(`- maxQueueLagMs: ${maxQueueLagMs}`);
  console.log(
    `- workflowHealth: ${enableWorkflowHealth ? "enabled" : "disabled"} (required=${requireWorkflowHealth ? "yes" : "no"})`,
  );
  console.log("");

  const results = [];
  for (let offset = 0; offset < scenarios.length; offset += burstSize) {
    const burstScenarios = scenarios.slice(offset, offset + burstSize);
    const burstIndex = Math.floor(offset / burstSize) + 1;
    const burstResults = await runBurst(burstScenarios, burstIndex, offset);
    results.push(...burstResults);
    if (offset + burstSize < scenarios.length) {
      await sleep(delayMs);
    }
  }

  const ackLatencies = results.map((item) => item.ackLatencyMs);
  const ackWithinSloCount = results.filter((item) => item.ackWithinSlo).length;
  const backgroundCount = results.filter(
    (item) => item.backgroundFollowupDetected,
  ).length;
  const degradedCount = results.filter(
    (item) => !item.ackWithinSlo || !item.backgroundFollowupDetected,
  ).length;
  const duplicateVisibleSideEffectCount = results.filter(
    (item) => item.duplicateVisibleSideEffects > 0,
  ).length;
  const duplicateVisibleSideEffectRate =
    results.length === 0 ? 0 : duplicateVisibleSideEffectCount / results.length;
  const queueLagValues = results
    .map((item) => item.queueLagMs)
    .filter((value) => typeof value === "number");
  const queueLagP95Ms = queueLagValues.length === 0 ? 0 : percentile(queueLagValues, 95);
  const ackWithinSloRate = results.length === 0 ? 0 : ackWithinSloCount / results.length;
  const backgroundFollowupRate =
    results.length === 0 ? 0 : backgroundCount / results.length;
  const degradedRate = results.length === 0 ? 1 : degradedCount / results.length;
  const workflowHealth = await fetchWorkflowHealthSnapshot();
  const guardrail = {
    concurrency,
    burstSize,
    minAckWithinSloRate,
    minBackgroundFollowupRate,
    maxDegradedRate,
    maxDuplicateSideEffectRate,
    maxQueueLagMs,
    ackWithinSloRate,
    backgroundFollowupRate,
    degradedRate,
    duplicateVisibleSideEffectRate,
    queueLagP95Ms,
    ackWithinSloPass: ackWithinSloRate >= minAckWithinSloRate,
    backgroundFollowupPass: backgroundFollowupRate >= minBackgroundFollowupRate,
    degradedRatePass: degradedRate <= maxDegradedRate,
    duplicateSideEffectPass:
      duplicateVisibleSideEffectRate <= maxDuplicateSideEffectRate,
    queueLagPass: queueLagP95Ms <= maxQueueLagMs,
    workflowHealthPass:
      workflowHealth.status === "passed" ||
      (workflowHealth.status === "skipped" && !requireWorkflowHealth),
    workflowHealthStatus: workflowHealth.status,
    workflowHealthReason: workflowHealth.reason,
  };

  const summary = {
    generatedAt: new Date().toISOString(),
    url: baseUrl,
    runCount: results.length,
    concurrency,
    burstSize,
    ackSloMs,
    backgroundWaitMs: bgWaitMs,
    ackLatencyMs: {
      p50: percentile(ackLatencies, 50),
      p95: percentile(ackLatencies, 95),
      max: Math.max(...ackLatencies),
    },
    ackWithinSloCount,
    ackWithinSloRate,
    backgroundFollowupCount: backgroundCount,
    backgroundFollowupRate,
    duplicateVisibleSideEffectCount,
    duplicateVisibleSideEffectRate,
    queueLagMs: {
      p95: queueLagP95Ms,
    },
    scenarioIds: results.map((result) => result.scenarioId),
    fallbackOrDegradedCount: degradedCount,
    fallbackOrDegradedRate: degradedRate,
    workflowHealth,
    guardrail,
    results: results.map((result) => ({
      run: result.run,
      workerIndex: result.workerIndex,
      burstIndex: result.burstIndex,
      threadId: result.threadId,
      scenarioId: result.scenarioId,
      prompt: result.prompt,
      intentId: result.intentId,
      ackLatencyMs: result.ackLatencyMs,
      ackWithinSlo: result.ackWithinSlo,
      ackDetectedMs: result.ackDetectedMs,
      queueLagMs: result.queueLagMs,
      duplicateVisibleSideEffects: result.duplicateVisibleSideEffects,
      ackMessage: summarizeMessage(result.ackMessage),
      backgroundFollowupDetected: result.backgroundFollowupDetected,
      backgroundMessage: summarizeMessage(result.backgroundMessage),
    })),
  };

  console.log("");
  console.log("summary");
  console.log(
    `- ack p50=${summary.ackLatencyMs.p50}ms p95=${summary.ackLatencyMs.p95}ms max=${summary.ackLatencyMs.max}ms`,
  );
  console.log(
    `- ack within slo: ${ackWithinSloCount}/${results.length} (${Math.round(
      ackWithinSloRate * 100,
    )}%)`,
  );
  console.log(
    `- background follow-up detected: ${backgroundCount}/${results.length} (${Math.round(
      backgroundFollowupRate * 100,
    )}%)`,
  );
  console.log(
    `- degraded/fallback: ${degradedCount}/${results.length} (${Math.round(
      degradedRate * 100,
    )}%)`,
  );
  console.log(
    `- duplicate visible side effects: ${duplicateVisibleSideEffectCount}/${results.length} (${Math.round(
      duplicateVisibleSideEffectRate * 100,
    )}%)`,
  );
  console.log(`- queue lag p95: ${queueLagP95Ms}ms`);
  console.log(
    `- guardrails: ack=${guardrail.ackWithinSloPass ? "pass" : "fail"} ` +
      `background=${guardrail.backgroundFollowupPass ? "pass" : "fail"} ` +
      `degraded=${guardrail.degradedRatePass ? "pass" : "fail"} ` +
      `duplicates=${guardrail.duplicateSideEffectPass ? "pass" : "fail"} ` +
      `queueLag=${guardrail.queueLagPass ? "pass" : "fail"} ` +
      `workflowHealth=${guardrail.workflowHealthPass ? "pass" : "fail"}`,
  );
  if (workflowHealth.status !== "skipped") {
    console.log(
      `- workflow health: critical=${Number(workflowHealth.health?.critical ?? 0)} ` +
        `failedStages=${Number(workflowHealth.stageStatusCounts?.failed ?? 0)} ` +
        `blockedStages=${Number(workflowHealth.stageStatusCounts?.blocked ?? 0)} ` +
        `observabilityGapRuns=${Number(workflowHealth.failureClasses?.observabilityGap ?? 0)}`,
    );
  } else {
    console.log(`- workflow health: ${workflowHealth.reason}`);
  }
  if (artifactPath) {
    await fs.mkdir(path.dirname(artifactPath), { recursive: true });
    await fs.writeFile(artifactPath, JSON.stringify(summary, null, 2));
    console.log(`- artifact: ${artifactPath}`);
  }

  if (
    !guardrail.ackWithinSloPass ||
    !guardrail.backgroundFollowupPass ||
    !guardrail.degradedRatePass ||
    !guardrail.duplicateSideEffectPass ||
    !guardrail.queueLagPass ||
    !guardrail.workflowHealthPass
  ) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("agentic benchmark failed");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
