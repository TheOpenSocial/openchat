#!/usr/bin/env node

const baseUrl = (process.env.SMOKE_BASE_URL || "http://localhost:3001").replace(
  /\/+$/,
  "",
);
const smokeHostHeader = process.env.SMOKE_HOST_HEADER?.trim() || "";
const probeToken = process.env.ONBOARDING_PROBE_TOKEN;
const accessToken = process.env.SMOKE_ACCESS_TOKEN;
const agentThreadId = process.env.SMOKE_AGENT_THREAD_ID;
const userId = process.env.SMOKE_USER_ID;

const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS || 12000);
const requestRetryCount = Math.max(
  0,
  Number(process.env.SMOKE_REQUEST_RETRY_COUNT || 2),
);
const requestRetryDelayMs = Math.max(
  100,
  Number(process.env.SMOKE_REQUEST_RETRY_DELAY_MS || 350),
);
const onboardingP95Ms = Number(process.env.SMOKE_ONBOARDING_P95_MS || 4000);
const agentP95Ms = Number(process.env.SMOKE_AGENT_P95_MS || 6000);
const maxOnboardingFallbackRate = Number(
  process.env.SMOKE_MAX_ONBOARDING_FALLBACK_RATE || 0.25,
);
const maxOnboardingUnavailableRate = Number(
  process.env.SMOKE_MAX_ONBOARDING_UNAVAILABLE_RATE || 0.2,
);
const maxOpenAIErrorRate = Number(
  process.env.SMOKE_MAX_OPENAI_ERROR_RATE || 0.2,
);
const allowCircuitOpen = process.env.SMOKE_ALLOW_OPENAI_CIRCUIT_OPEN === "true";
const enforceOnboardingModelBuckets =
  process.env.SMOKE_ENFORCE_ONBOARDING_MODEL_BUCKETS !== "false";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function requestJson(path, init = {}) {
  const requestStartedAt = Date.now();
  let lastError = null;

  for (let attempt = 0; attempt <= requestRetryCount; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const headers = {
      Accept: "application/json",
      ...(smokeHostHeader ? { Host: smokeHostHeader } : {}),
      ...(init.headers || {}),
    };

    try {
      const response = await fetch(`${baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers,
      });

      const durationMs = Date.now() - requestStartedAt;
      let body = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }

      const transientStatus =
        response.status === 408 ||
        response.status === 425 ||
        response.status === 429 ||
        response.status >= 500;
      if (!response.ok && transientStatus && attempt < requestRetryCount) {
        await sleep(requestRetryDelayMs * (attempt + 1));
        continue;
      }

      return { ok: response.ok, status: response.status, body, durationMs };
    } catch (error) {
      lastError = error;
      const isAbort =
        error && typeof error === "object" && error.name === "AbortError";
      const message = error instanceof Error ? error.message : String(error);
      const transientError =
        isAbort ||
        message.includes("fetch failed") ||
        message.includes("ECONNRESET") ||
        message.includes("ECONNREFUSED") ||
        message.includes("ETIMEDOUT") ||
        message.includes("ENOTFOUND");

      if (transientError && attempt < requestRetryCount) {
        await sleep(requestRetryDelayMs * (attempt + 1));
        continue;
      }
      break;
    } finally {
      clearTimeout(timeout);
    }
  }

  const durationMs = Date.now() - requestStartedAt;
  const errorMessage =
    lastError instanceof Error
      ? lastError.message
      : String(lastError ?? "unknown_error");
  return {
    ok: false,
    status: 0,
    body: {
      success: false,
      error: {
        code: "request_failed",
        message: errorMessage,
      },
    },
    durationMs,
  };
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

  const result = await requestJson(
    `/api/agent/threads/${agentThreadId}/respond`,
    {
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
    },
  );

  return {
    id: "agent_respond_moderation_path",
    skipped: false,
    ...result,
    successEnvelope: result.body?.success === true,
    hasAssistantMessage: Boolean(result.body?.data?.assistantMessage?.content),
  };
}

async function runLlmRuntimeHealthSmoke() {
  if (!accessToken) {
    return {
      id: "llm_runtime_health",
      skipped: true,
      reason: "missing SMOKE_ACCESS_TOKEN",
    };
  }
  const result = await requestJson("/api/admin/ops/llm-runtime-health", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "x-admin-user-id":
        process.env.SMOKE_ADMIN_USER_ID ||
        "11111111-1111-4111-8111-111111111111",
      "x-admin-role": process.env.SMOKE_ADMIN_ROLE || "support",
      ...(process.env.SMOKE_ADMIN_API_KEY
        ? { "x-admin-api-key": process.env.SMOKE_ADMIN_API_KEY }
        : {}),
    },
  });
  return {
    id: "llm_runtime_health",
    skipped: false,
    ...result,
  };
}

function normalizeLlmHealthSnapshot(payload) {
  const root = payload?.data ?? {};
  const onboarding = root.onboarding ?? {};
  const byMode = onboarding.byMode ?? {};
  const fastMode = byMode.fast ?? {};
  const richMode = byMode.rich ?? {};
  const onboardingCalls = Number(onboarding.calls ?? 0);
  const onboardingFallbacks =
    Number(fastMode.fallbacks ?? 0) + Number(richMode.fallbacks ?? 0);
  const onboardingUnavailable =
    Number(fastMode.unavailable ?? 0) + Number(richMode.unavailable ?? 0);
  const openaiCalls = Number(root.openai?.calls ?? 0);
  const openaiErrorRate = Number(root.openai?.errorRate ?? 0);
  const openaiErrors = Math.max(0, Math.round(openaiErrorRate * openaiCalls));
  return {
    onboardingCalls,
    onboardingFallbacks,
    onboardingUnavailable,
    openaiCalls,
    openaiErrors,
    raw: root,
  };
}

function computeRuntimeWindow(before, after) {
  if (!before || !after) {
    return null;
  }
  return {
    onboardingCalls: Math.max(
      0,
      after.onboardingCalls - before.onboardingCalls,
    ),
    onboardingFallbacks: Math.max(
      0,
      after.onboardingFallbacks - before.onboardingFallbacks,
    ),
    onboardingUnavailable: Math.max(
      0,
      after.onboardingUnavailable - before.onboardingUnavailable,
    ),
    openaiCalls: Math.max(0, after.openaiCalls - before.openaiCalls),
    openaiErrors: Math.max(0, after.openaiErrors - before.openaiErrors),
  };
}

function printResult(result) {
  if (result.skipped) {
    console.log(`- [SKIP] ${result.id}: ${result.reason}`);
    return;
  }
  const mark = result.ok ? "PASS" : "FAIL";
  console.log(
    `- [${mark}] ${result.id} (${result.status}) in ${result.durationMs}ms`,
  );
  if (!result.ok) {
    console.log(`  body: ${JSON.stringify(result.body).slice(0, 300)}`);
  }
}

async function main() {
  console.log("LLM runtime smoke");
  console.log(`- baseUrl: ${baseUrl}`);
  console.log(`- smokeHostHeader: ${smokeHostHeader || "(none)"}`);
  console.log(`- timeoutMs: ${timeoutMs}`);
  console.log(`- probeToken: ${probeToken ? "set" : "unset"}`);
  console.log(`- accessToken: ${accessToken ? "set" : "unset"}`);
  console.log("");

  const runtimeBefore = await runLlmRuntimeHealthSmoke();
  let runtimeBeforeSnapshot = null;
  if (!runtimeBefore.skipped && runtimeBefore.ok) {
    runtimeBeforeSnapshot = normalizeLlmHealthSnapshot(runtimeBefore.body);
    console.log(
      `- runtime baseline: onboardingCalls=${runtimeBeforeSnapshot.onboardingCalls}, onboardingFallbacks=${runtimeBeforeSnapshot.onboardingFallbacks}, onboardingUnavailable=${runtimeBeforeSnapshot.onboardingUnavailable}, openaiCalls=${runtimeBeforeSnapshot.openaiCalls}, openaiErrors=${runtimeBeforeSnapshot.openaiErrors}`,
    );
  } else if (!runtimeBefore.skipped) {
    console.log(
      "- runtime baseline unavailable; falling back to post-run cumulative checks",
    );
  }

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
    await runLlmRuntimeHealthSmoke(),
  ];

  checks.forEach(printResult);

  const failed = checks.filter((check) => !check.skipped && !check.ok);
  if (failed.length > 0) {
    const failedSummary = failed
      .map((check) => `${check.id}:${check.status ?? "ERR"}`)
      .join(", ");
    console.error(`\nSmoke failed: ${failed.length} checks failed.`);
    console.error(`Failed checks: ${failedSummary}`);
    for (const check of failed) {
      const preview =
        check.body && typeof check.body === "object"
          ? JSON.stringify(check.body).slice(0, 300)
          : null;
      if (preview) {
        console.error(`- ${check.id} body: ${preview}`);
      }
    }
    process.exit(1);
  }

  const onboardingLatencies = checks
    .filter((check) => check.id.startsWith("onboarding_") && !check.skipped)
    .map((check) => check.durationMs);
  const agentLatencies = checks
    .filter(
      (check) => check.id === "agent_respond_moderation_path" && !check.skipped,
    )
    .map((check) => check.durationMs);

  const onboardingP95 = percentile(onboardingLatencies, 95);
  const agentP95 = percentile(agentLatencies, 95);

  console.log("");
  console.log(
    `Latency summary: onboarding p95=${onboardingP95}ms, agent p95=${agentP95}ms`,
  );

  if (onboardingLatencies.length > 0 && onboardingP95 > onboardingP95Ms) {
    console.error(
      `Onboarding latency SLO breach: p95=${onboardingP95}ms > ${onboardingP95Ms}ms`,
    );
    process.exit(1);
  }
  if (agentLatencies.length > 0 && agentP95 > agentP95Ms) {
    console.error(
      `Agent latency SLO breach: p95=${agentP95}ms > ${agentP95Ms}ms`,
    );
    process.exit(1);
  }

  const llmHealth = checks.find((check) => check.id === "llm_runtime_health");
  if (llmHealth && !llmHealth.skipped && llmHealth.body?.data) {
    const health = llmHealth.body.data;
    const normalizedAfter = normalizeLlmHealthSnapshot(llmHealth.body);
    const runtimeWindow = computeRuntimeWindow(
      runtimeBeforeSnapshot,
      normalizedAfter,
    );
    const fallbackRate =
      runtimeWindow && runtimeWindow.onboardingCalls > 0
        ? runtimeWindow.onboardingFallbacks / runtimeWindow.onboardingCalls
        : Number(health.onboarding?.fallbackRate ?? 0);
    const unavailableRate =
      runtimeWindow && runtimeWindow.onboardingCalls > 0
        ? runtimeWindow.onboardingUnavailable / runtimeWindow.onboardingCalls
        : Number(health.onboarding?.unavailableRate ?? 0);
    const openaiErrorRate =
      runtimeWindow && runtimeWindow.openaiCalls > 0
        ? runtimeWindow.openaiErrors / runtimeWindow.openaiCalls
        : Number(health.openai?.errorRate ?? 0);
    const anyCircuitOpen = Boolean(health.budget?.anyCircuitOpen);
    const byModel = Array.isArray(health.onboarding?.byModel)
      ? health.onboarding.byModel
      : [];
    const fastModel = process.env.ONBOARDING_LLM_FAST_MODEL?.trim();
    const richModel = process.env.ONBOARDING_LLM_RICH_MODEL?.trim();
    if (runtimeWindow) {
      console.log(
        `Runtime health window: onboardingCallsDelta=${runtimeWindow.onboardingCalls}, onboardingFallbacksDelta=${runtimeWindow.onboardingFallbacks}, onboardingUnavailableDelta=${runtimeWindow.onboardingUnavailable}, openaiCallsDelta=${runtimeWindow.openaiCalls}, openaiErrorsDelta=${runtimeWindow.openaiErrors}`,
      );
    }
    console.log(
      `Runtime health: onboardingFallbackRate=${fallbackRate.toFixed(3)}, onboardingUnavailableRate=${unavailableRate.toFixed(3)}, openaiErrorRate=${openaiErrorRate.toFixed(3)}, circuitOpen=${anyCircuitOpen}`,
    );

    if (fallbackRate > maxOnboardingFallbackRate) {
      console.error(
        `Onboarding fallback rate too high: ${fallbackRate} > ${maxOnboardingFallbackRate}`,
      );
      process.exit(1);
    }
    if (unavailableRate > maxOnboardingUnavailableRate) {
      console.error(
        `Onboarding unavailable rate too high: ${unavailableRate} > ${maxOnboardingUnavailableRate}`,
      );
      process.exit(1);
    }
    if (openaiErrorRate > maxOpenAIErrorRate) {
      console.error(
        `OpenAI error rate too high: ${openaiErrorRate} > ${maxOpenAIErrorRate}`,
      );
      process.exit(1);
    }
    if (
      enforceOnboardingModelBuckets &&
      (fastModel || richModel) &&
      byModel.length > 0
    ) {
      const modelSet = new Set(
        byModel
          .map((entry) =>
            typeof entry?.model === "string" ? entry.model.trim() : "",
          )
          .filter((entry) => entry.length > 0),
      );
      if (fastModel && !modelSet.has(fastModel)) {
        console.error(
          `Missing fast onboarding model bucket in runtime health: ${fastModel}`,
        );
        process.exit(1);
      }
      if (richModel && !modelSet.has(richModel)) {
        console.error(
          `Missing rich onboarding model bucket in runtime health: ${richModel}`,
        );
        process.exit(1);
      }
    }
    if (anyCircuitOpen && !allowCircuitOpen) {
      console.error("OpenAI budget circuit is open; failing smoke.");
      process.exit(1);
    }
  }

  console.log("LLM runtime smoke passed.");
}

await main();
