#!/usr/bin/env node

const baseUrl = (process.env.SMOKE_BASE_URL || "http://localhost:3001").replace(
  /\/+$/,
  "",
);
const smokeHostHeader = process.env.SMOKE_HOST_HEADER?.trim() || "";
const adminUserId =
  process.env.SMOKE_ADMIN_USER_ID || "11111111-1111-4111-8111-111111111111";
const adminRole = process.env.SMOKE_ADMIN_ROLE || "support";
const adminApiKey = process.env.SMOKE_ADMIN_API_KEY;
const accessToken = process.env.SMOKE_ACCESS_TOKEN;
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS || 12000);
const useUniqueForwardedIp =
  process.env.SMOKE_USE_UNIQUE_IP === "false"
    ? false
    : /^(http:\/\/localhost|http:\/\/127\.0\.0\.1)/.test(baseUrl);

const checks = [
  {
    id: "health",
    method: "GET",
    path: "/health",
    admin: false,
  },
  {
    id: "admin_health",
    method: "GET",
    path: "/admin/health",
    admin: true,
  },
  {
    id: "ops_metrics",
    method: "GET",
    path: "/admin/ops/metrics",
    admin: true,
  },
  {
    id: "ops_alerts",
    method: "GET",
    path: "/admin/ops/alerts",
    admin: true,
  },
  {
    id: "ops_agentic_evals",
    method: "GET",
    path: "/admin/ops/agentic-evals",
    admin: true,
  },
  {
    id: "queue_overview",
    method: "GET",
    path: "/admin/jobs/queues",
    admin: true,
  },
  {
    id: "dead_letters",
    method: "GET",
    path: "/admin/jobs/dead-letters",
    admin: true,
  },
  {
    id: "moderation_agent_risk",
    method: "GET",
    path: "/admin/moderation/agent-risk-flags?limit=20",
    admin: true,
  },
];

function buildHeaders(useAdminHeaders, checkIndex) {
  const headers = {
    Accept: "application/json",
  };

  if (useAdminHeaders) {
    headers["x-admin-user-id"] = adminUserId;
    headers["x-admin-role"] = adminRole;
    if (adminApiKey) {
      headers["x-admin-api-key"] = adminApiKey;
    }
  }

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  if (smokeHostHeader) {
    headers.Host = smokeHostHeader;
  }
  if (useUniqueForwardedIp) {
    headers["x-forwarded-for"] = `198.51.100.${10 + checkIndex}`;
  }

  return headers;
}

async function runCheck(check, checkIndex) {
  const url = `${baseUrl}${check.path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  try {
    const response = await fetch(url, {
      method: check.method,
      headers: buildHeaders(check.admin, checkIndex),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const elapsedMs = Date.now() - startedAt;
    let parsed = null;

    try {
      parsed = await response.json();
    } catch {
      parsed = null;
    }

    return {
      id: check.id,
      url,
      ok: response.ok,
      status: response.status,
      elapsedMs,
      bodyPreview:
        parsed && typeof parsed === "object"
          ? JSON.stringify(parsed).slice(0, 200)
          : null,
    };
  } catch (error) {
    clearTimeout(timeout);
    return {
      id: check.id,
      url,
      ok: false,
      status: null,
      elapsedMs: Date.now() - startedAt,
      bodyPreview:
        error instanceof Error ? `request_failed:${error.message}` : null,
    };
  }
}

function printConfig() {
  console.log("Staging smoke config:");
  console.log(`- baseUrl: ${baseUrl}`);
  console.log(`- smokeHostHeader: ${smokeHostHeader || "(none)"}`);
  console.log(`- adminUserId: ${adminUserId}`);
  console.log(`- adminRole: ${adminRole}`);
  console.log(`- timeoutMs: ${timeoutMs}`);
  console.log(`- adminApiKey: ${adminApiKey ? "set" : "unset"}`);
  console.log(`- accessToken: ${accessToken ? "set" : "unset"}`);
  console.log(`- useUniqueForwardedIp: ${useUniqueForwardedIp}`);
  console.log("");
}

function printResults(results) {
  console.log("Smoke results:");
  for (const result of results) {
    const statusText = result.status === null ? "ERR" : String(result.status);
    const mark = result.ok ? "PASS" : "FAIL";
    console.log(
      `- [${mark}] ${result.id} (${statusText}) in ${result.elapsedMs}ms`,
    );
    if (!result.ok && result.bodyPreview) {
      console.log(`  preview: ${result.bodyPreview}`);
    }
  }
  console.log("");
}

async function main() {
  printConfig();

  const results = [];
  for (const [index, check] of checks.entries()) {
    // Keep requests serialized to simplify service-side tracing while on-call triages failures.
    const result = await runCheck(check, index);
    results.push(result);
  }

  printResults(results);

  const failed = results.filter((result) => !result.ok);
  if (failed.length > 0) {
    const failedSummary = failed
      .map((result) => `${result.id}:${result.status ?? "ERR"}`)
      .join(", ");
    console.error(
      `Smoke verification failed: ${failed.length}/${results.length} checks failed.`,
    );
    console.error(`Failed checks: ${failedSummary}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `Smoke verification passed: ${results.length}/${results.length} checks OK.`,
  );
}

await main();
