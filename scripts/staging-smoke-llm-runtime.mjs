#!/usr/bin/env node

const baseUrl = (process.env.SMOKE_BASE_URL || "http://localhost:3001").replace(
  /\/+$/,
  "",
);
const probeToken = process.env.ONBOARDING_PROBE_TOKEN;
const accessToken = process.env.SMOKE_ACCESS_TOKEN;
const agentThreadId = process.env.SMOKE_AGENT_THREAD_ID;
const userId = process.env.SMOKE_USER_ID;

const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS || 12000);
const onboardingP95Ms = Number(process.env.SMOKE_ONBOARDING_P95_MS || 4000);
const agentP95Ms = Number(process.env.SMOKE_AGENT_P95_MS || 6000);

async function requestJson(path, init = {}) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(init.headers || {}),
      },
    });
    const durationMs = Date.now() - startedAt;
    let body = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    return { ok: response.ok, status: response.status, body, durationMs };
  } finally {
    clearTimeout(timeout);
  }
}

function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[idx] ?? 0;
}

async function runOnboardingProbe(mode, transcript) {
  if (!probeToken) {
    return {
      id: `onboarding_${mode}`,
      skipped: true,
      reason: "missing ONBOARDING_PROBE_TOKEN",
    };
  }
  const result = await requestJson("/api/onboarding/probe", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-onboarding-probe-token": probeToken,
    },
    body: JSON.stringify({ mode, transcript }),
  });

  return {
    id: `onboarding_${mode}`,
    skipped: false,
    ...result,
    successEnvelope: result.body?.success === true,
    hasSummary: Boolean(result.body?.data?.result?.summary),
  };
}

async function runAgentRespondSmoke() {
  if (!accessToken || !agentThreadId || !userId) {
    return {
      id: "agent_respond_moderation_path",
      skipped: true,
      reason:
        "missing SMOKE_ACCESS_TOKEN or SMOKE_AGENT_THREAD_ID or SMOKE_USER_ID",
    };
  }

  const result = await requestJson(`/api/agent/threads/${agentThreadId}/respond`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      "Idempotency-Key": `smoke-${Date.now()}`,
    },
    body: JSON.stringify({
      userId,
      content:
        "Please help me find a safe local meetup. Also review this phrase: weapon meetup.",
    }),
  });

  return {
    id: "agent_respond_moderation_path",
    skipped: false,
    ...result,
    successEnvelope: result.body?.success === true,
    hasAssistantMessage: Boolean(result.body?.data?.assistantMessage?.content),
  };
}

function printResult(result) {
  if (result.skipped) {
    console.log(`- [SKIP] ${result.id}: ${result.reason}`);
    return;
  }
  const mark = result.ok ? "PASS" : "FAIL";
  console.log(`- [${mark}] ${result.id} (${result.status}) in ${result.durationMs}ms`);
  if (!result.ok) {
    console.log(`  body: ${JSON.stringify(result.body).slice(0, 300)}`);
  }
}

async function main() {
  console.log("LLM runtime smoke");
  console.log(`- baseUrl: ${baseUrl}`);
  console.log(`- timeoutMs: ${timeoutMs}`);
  console.log(`- probeToken: ${probeToken ? "set" : "unset"}`);
  console.log(`- accessToken: ${accessToken ? "set" : "unset"}`);
  console.log("");

  const checks = [
    await runOnboardingProbe(
      "fast",
      "I want to meet thoughtful people around design and football this week.",
    ),
    await runOnboardingProbe(
      "rich",
      "I just moved and want to find real connections, mostly in small groups, weekends work best.",
    ),
    await runAgentRespondSmoke(),
  ];

  checks.forEach(printResult);

  const failed = checks.filter((check) => !check.skipped && !check.ok);
  if (failed.length > 0) {
    console.error(`\nSmoke failed: ${failed.length} checks failed.`);
    process.exit(1);
  }

  const onboardingLatencies = checks
    .filter((check) => check.id.startsWith("onboarding_") && !check.skipped)
    .map((check) => check.durationMs);
  const agentLatencies = checks
    .filter((check) => check.id === "agent_respond_moderation_path" && !check.skipped)
    .map((check) => check.durationMs);

  const onboardingP95 = percentile(onboardingLatencies, 95);
  const agentP95 = percentile(agentLatencies, 95);

  console.log("");
  console.log(`Latency summary: onboarding p95=${onboardingP95}ms, agent p95=${agentP95}ms`);

  if (onboardingLatencies.length > 0 && onboardingP95 > onboardingP95Ms) {
    console.error(
      `Onboarding latency SLO breach: p95=${onboardingP95}ms > ${onboardingP95Ms}ms`,
    );
    process.exit(1);
  }
  if (agentLatencies.length > 0 && agentP95 > agentP95Ms) {
    console.error(`Agent latency SLO breach: p95=${agentP95}ms > ${agentP95Ms}ms`);
    process.exit(1);
  }

  console.log("LLM runtime smoke passed.");
}

await main();
