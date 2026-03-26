#!/usr/bin/env node

import { access } from "node:fs/promises";
import process from "node:process";

const cwd = process.cwd();
const baseUrl = (process.env.SMOKE_BASE_URL || "http://localhost:3001").replace(
  /\/+$/,
  "",
);
const adminUserId =
  process.env.SMOKE_ADMIN_USER_ID || "11111111-1111-4111-8111-111111111111";
const adminRole = process.env.SMOKE_ADMIN_ROLE || "support";
const adminApiKey = process.env.SMOKE_ADMIN_API_KEY;
const accessToken = process.env.SMOKE_ACCESS_TOKEN;
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS || 12000);
const failOnWarning = process.env.INCIDENT_VERIFY_FAIL_ON_WARNING === "true";
const requireHealthySummary =
  process.env.INCIDENT_VERIFY_REQUIRE_HEALTHY !== "false";
const allowCriticalAlerts =
  process.env.INCIDENT_VERIFY_ALLOW_CRITICAL === "true";
const verifyRunbooks = process.env.INCIDENT_VERIFY_RUNBOOKS !== "false";
const skipHttpChecks = process.env.INCIDENT_VERIFY_SKIP_HTTP === "true";

const runbookFiles = (
  process.env.INCIDENT_VERIFY_RUNBOOK_FILES ||
  [
    "docs/incident-runbook.md",
    "docs/admin-runbook.md",
    "docs/queue-replay-runbook.md",
    "docs/staging-smoke-checklist.md",
  ].join(",")
)
  .split(",")
  .map((entry) => entry.trim())
  .filter(Boolean);

const checks = [
  {
    id: "health",
    method: "GET",
    path: "/api/health",
    admin: false,
  },
  {
    id: "ops_alerts",
    method: "GET",
    path: "/api/admin/ops/alerts",
    admin: true,
  },
  {
    id: "ops_metrics",
    method: "GET",
    path: "/api/admin/ops/metrics",
    admin: true,
  },
  {
    id: "launch_controls",
    method: "GET",
    path: "/api/admin/launch-controls",
    admin: true,
  },
  {
    id: "queue_overview",
    method: "GET",
    path: "/api/admin/jobs/queues",
    admin: true,
  },
];

function buildHeaders(useAdminHeaders, checkIndex) {
  const headers = {
    Accept: "application/json",
    "x-forwarded-for": `198.51.100.${20 + checkIndex}`,
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

  return headers;
}

async function runHttpCheck(check, checkIndex) {
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

    let parsed = null;
    try {
      parsed = await response.json();
    } catch {
      parsed = null;
    }

    return {
      ...check,
      ok: response.ok,
      status: response.status,
      elapsedMs: Date.now() - startedAt,
      body: parsed,
      preview:
        parsed && typeof parsed === "object"
          ? JSON.stringify(parsed).slice(0, 240)
          : null,
    };
  } catch (error) {
    clearTimeout(timeout);
    return {
      ...check,
      ok: false,
      status: null,
      elapsedMs: Date.now() - startedAt,
      body: null,
      preview:
        error instanceof Error
          ? `request_failed:${error.message}`
          : String(error),
    };
  }
}

async function verifyRunbookFiles() {
  const results = [];
  for (const file of runbookFiles) {
    try {
      await access(file);
      results.push({ file, ok: true });
    } catch {
      results.push({ file, ok: false });
    }
  }
  return results;
}

function getAlertsSummary(alertsResult) {
  if (!alertsResult?.body || typeof alertsResult.body !== "object") {
    return null;
  }

  const data = alertsResult.body?.data;
  if (!data || typeof data !== "object") {
    return null;
  }

  const summary = data.summary;
  if (!summary || typeof summary !== "object") {
    return null;
  }

  return {
    status: typeof summary.status === "string" ? summary.status : "unknown",
    warningCount:
      typeof summary.warningCount === "number" ? summary.warningCount : null,
    criticalCount:
      typeof summary.criticalCount === "number" ? summary.criticalCount : null,
  };
}

function printConfig() {
  console.log("Incident verification config:");
  console.log(`- cwd: ${cwd}`);
  console.log(`- baseUrl: ${baseUrl}`);
  console.log(`- adminUserId: ${adminUserId}`);
  console.log(`- adminRole: ${adminRole}`);
  console.log(`- timeoutMs: ${timeoutMs}`);
  console.log(`- requireHealthySummary: ${requireHealthySummary}`);
  console.log(`- allowCriticalAlerts: ${allowCriticalAlerts}`);
  console.log(`- failOnWarning: ${failOnWarning}`);
  console.log(`- verifyRunbooks: ${verifyRunbooks}`);
  console.log(`- skipHttpChecks: ${skipHttpChecks}`);
  console.log(`- adminApiKey: ${adminApiKey ? "set" : "unset"}`);
  console.log(`- accessToken: ${accessToken ? "set" : "unset"}`);
  if (verifyRunbooks) {
    console.log(`- runbookFiles: ${runbookFiles.join(", ")}`);
  }
  console.log("");
}

function printHttpResults(results) {
  console.log("HTTP verification results:");
  for (const result of results) {
    const mark = result.ok ? "PASS" : "FAIL";
    const statusText = result.status === null ? "ERR" : String(result.status);
    console.log(
      `- [${mark}] ${result.id} (${statusText}) in ${result.elapsedMs}ms`,
    );
    if (!result.ok && result.preview) {
      console.log(`  preview: ${result.preview}`);
    }
  }
  console.log("");
}

function printRunbookResults(results) {
  console.log("Runbook file checks:");
  for (const result of results) {
    console.log(`- [${result.ok ? "PASS" : "FAIL"}] ${result.file}`);
  }
  console.log("");
}

async function main() {
  printConfig();

  const httpResults = [];
  if (!skipHttpChecks) {
    for (const [index, check] of checks.entries()) {
      // Keep checks serialized to simplify incident traceability.
      const result = await runHttpCheck(check, index);
      httpResults.push(result);
    }
  } else {
    console.log("HTTP verification results:");
    console.log(
      "- [SKIP] Network checks disabled via INCIDENT_VERIFY_SKIP_HTTP=true",
    );
    console.log("");
  }
  if (!skipHttpChecks) {
    printHttpResults(httpResults);
  }

  const failedHttpChecks = httpResults.filter((result) => !result.ok);

  const alertsResult = httpResults.find((result) => result.id === "ops_alerts");
  const alertsSummary = getAlertsSummary(alertsResult);

  if (alertsSummary) {
    console.log("Alert summary:");
    console.log(`- status: ${alertsSummary.status}`);
    console.log(`- criticalCount: ${alertsSummary.criticalCount ?? "n/a"}`);
    console.log(`- warningCount: ${alertsSummary.warningCount ?? "n/a"}`);
    console.log("");
  }

  let runbookResults = [];
  if (verifyRunbooks) {
    runbookResults = await verifyRunbookFiles();
    printRunbookResults(runbookResults);
  }

  const failedRunbookChecks = runbookResults.filter((result) => !result.ok);

  const summaryIssues = [];
  if (!skipHttpChecks && !alertsSummary) {
    summaryIssues.push("ops_alerts summary is missing/unparseable");
  } else if (!skipHttpChecks) {
    if (
      !allowCriticalAlerts &&
      alertsSummary.criticalCount !== null &&
      alertsSummary.criticalCount > 0
    ) {
      summaryIssues.push(
        `critical alerts detected (${alertsSummary.criticalCount})`,
      );
    }
    if (
      failOnWarning &&
      alertsSummary.warningCount !== null &&
      alertsSummary.warningCount > 0
    ) {
      summaryIssues.push(
        `warning alerts detected (${alertsSummary.warningCount})`,
      );
    }
    if (requireHealthySummary && alertsSummary.status !== "healthy") {
      summaryIssues.push(
        `alert summary status is not healthy (${alertsSummary.status})`,
      );
    }
  }

  if (
    failedHttpChecks.length > 0 ||
    failedRunbookChecks.length > 0 ||
    summaryIssues.length > 0
  ) {
    console.error("Incident readiness verification failed.");
    if (failedHttpChecks.length > 0) {
      console.error(`- HTTP check failures: ${failedHttpChecks.length}`);
    }
    if (failedRunbookChecks.length > 0) {
      console.error(`- Missing runbook files: ${failedRunbookChecks.length}`);
    }
    for (const issue of summaryIssues) {
      console.error(`- ${issue}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("Incident readiness verification passed.");
}

await main();
