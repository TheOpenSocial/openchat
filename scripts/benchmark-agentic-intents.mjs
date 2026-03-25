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
 * - AGENTIC_BENCH_DATASET (default: scripts/agentic-benchmark-dataset.json)
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
const datasetPath =
  process.env.AGENTIC_BENCH_DATASET ??
  path.resolve(process.cwd(), "scripts/agentic-benchmark-dataset.json");

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
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error(`Dataset must be a non-empty array: ${datasetPath}`);
  }
  return parsed.map((item) => String(item).trim()).filter(Boolean);
}

async function fetchThreadMessages() {
  const data = await requestJson(`/api/agent/threads/${threadId}/messages`);
  return Array.isArray(data) ? data : [];
}

async function runOne(index, prompt) {
  const beforeMessages = await fetchThreadMessages();
  const beforeCount = beforeMessages.length;
  const startedAt = Date.now();

  const createIntentResult = await requestJson("/api/intents/from-agent", {
    method: "POST",
    body: JSON.stringify({
      threadId,
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
    const current = await fetchThreadMessages();
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
  const backgroundDeadline = Date.now() + bgWaitMs;
  while (Date.now() < backgroundDeadline) {
    const current = await fetchThreadMessages();
    const newlyAdded = current.slice(beforeCount);
    const nonUserMessages = newlyAdded.filter(isNonUserMessage);
    if (nonUserMessages.length >= 2) {
      backgroundMessage = nonUserMessages[nonUserMessages.length - 1];
      break;
    }
    await sleep(pollMs);
  }

  return {
    run: index + 1,
    prompt,
    intentId,
    ackLatencyMs,
    ackWithinSlo: ackLatencyMs <= ackSloMs,
    ackMessage,
    ackDetectedMs:
      ackDetectedAt === null ? null : Math.max(0, ackDetectedAt - startedAt),
    backgroundFollowupDetected: Boolean(backgroundMessage),
    backgroundMessage,
  };
}

async function main() {
  if (!accessToken || !userId || !threadId) {
    throw new Error(
      "Missing required env. Set AGENTIC_BENCH_ACCESS_TOKEN, AGENTIC_BENCH_USER_ID, and AGENTIC_BENCH_THREAD_ID.",
    );
  }

  const dataset = await loadDataset();
  const selectedRuns = Math.max(1, Math.min(runs, dataset.length));
  const prompts = dataset.slice(0, selectedRuns);

  console.log("agentic benchmark starting");
  console.log(`- url: ${baseUrl}`);
  console.log(`- runs: ${selectedRuns}`);
  console.log(`- ackSloMs: ${ackSloMs}`);
  console.log(`- backgroundWaitMs: ${bgWaitMs}`);
  console.log(`- pollMs: ${pollMs}`);
  console.log("");

  const results = [];
  for (let i = 0; i < prompts.length; i += 1) {
    const prompt = prompts[i];
    const result = await runOne(i, prompt);
    results.push(result);

    console.log(
      `[run ${result.run}] ack=${result.ackLatencyMs}ms (${result.ackWithinSlo ? "within_slo" : "over_slo"}) ` +
        `ackMessage="${summarizeMessage(result.ackMessage)}" ` +
        `backgroundFollowup=${result.backgroundFollowupDetected ? "yes" : "no"}`,
    );

    if (i < prompts.length - 1) {
      await sleep(delayMs);
    }
  }

  const ackLatencies = results.map((item) => item.ackLatencyMs);
  const ackWithinSloCount = results.filter((item) => item.ackWithinSlo).length;
  const backgroundCount = results.filter(
    (item) => item.backgroundFollowupDetected,
  ).length;

  console.log("");
  console.log("summary");
  console.log(
    `- ack p50=${percentile(ackLatencies, 50)}ms p95=${percentile(ackLatencies, 95)}ms max=${Math.max(...ackLatencies)}ms`,
  );
  console.log(
    `- ack within slo: ${ackWithinSloCount}/${results.length} (${Math.round(
      (ackWithinSloCount / results.length) * 100,
    )}%)`,
  );
  console.log(
    `- background follow-up detected: ${backgroundCount}/${results.length} (${Math.round(
      (backgroundCount / results.length) * 100,
    )}%)`,
  );

  const failedSlo = results.filter((item) => !item.ackWithinSlo).length;
  if (failedSlo > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("agentic benchmark failed");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
