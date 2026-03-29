#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { randomUUID } from "node:crypto";

const baseUrl = (process.env.SMOKE_BASE_URL || "http://localhost:3001").replace(
  /\/+$/,
  "",
);
const adminUserId =
  process.env.SMOKE_ADMIN_USER_ID || "11111111-1111-4111-8111-111111111111";
const adminRole = process.env.SMOKE_ADMIN_ROLE || "admin";
const adminApiKey = process.env.SMOKE_ADMIN_API_KEY;
const adminAccessToken = process.env.SMOKE_ACCESS_TOKEN;
const smokeApplicationKey = process.env.SMOKE_APPLICATION_KEY?.trim() || "";
const smokeApplicationToken =
  process.env.SMOKE_APPLICATION_TOKEN?.trim() || "";
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS || 15000);

const existingFlagId = process.env.MODERATION_DRILL_EXISTING_FLAG_ID?.trim();
const runId =
  process.env.MODERATION_DRILL_RUN_ID?.trim() ||
  `moderation-drill-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
const artifactDir = path.resolve(
  process.cwd(),
  process.env.MODERATION_DRILL_ARTIFACT_DIR?.trim() ||
    ".artifacts/moderation-drill",
);
const artifactPath = path.resolve(artifactDir, `${runId}.json`);
const queuePollTimeoutMs = Number(
  process.env.MODERATION_DRILL_QUEUE_POLL_TIMEOUT_MS || 10_000,
);
const queuePollIntervalMs = Number(
  process.env.MODERATION_DRILL_QUEUE_POLL_INTERVAL_MS || 500,
);
const auditPollTimeoutMs = Number(
  process.env.MODERATION_DRILL_AUDIT_POLL_TIMEOUT_MS || 12_000,
);
const auditPollIntervalMs = Number(
  process.env.MODERATION_DRILL_AUDIT_POLL_INTERVAL_MS || 600,
);
const enforcementPollTimeoutMs = Number(
  process.env.MODERATION_DRILL_ENFORCEMENT_POLL_TIMEOUT_MS || 8_000,
);
const enforcementPollIntervalMs = Number(
  process.env.MODERATION_DRILL_ENFORCEMENT_POLL_INTERVAL_MS || 500,
);
let reporterUserId =
  process.env.MODERATION_DRILL_REPORTER_USER_ID?.trim() ||
  process.env.SMOKE_USER_ID?.trim() ||
  "";
let reporterAccessToken =
  process.env.MODERATION_DRILL_ACCESS_TOKEN?.trim() ||
  process.env.SMOKE_ACCESS_TOKEN?.trim() ||
  "";
const targetUserId =
  process.env.MODERATION_DRILL_TARGET_USER_ID?.trim() ||
  process.env.SMOKE_ADMIN_USER_ID?.trim() ||
  "";
const entityType = process.env.MODERATION_DRILL_ENTITY_TYPE?.trim() || "user";
const entityId =
  process.env.MODERATION_DRILL_ENTITY_ID?.trim() ||
  (entityType === "user" ? targetUserId || "" : "");
const reportReason =
  process.env.MODERATION_DRILL_REPORT_REASON?.trim() ||
  "staging_operator_drill";
const reportDetails =
  process.env.MODERATION_DRILL_REPORT_DETAILS?.trim() ||
  "Synthetic moderation drill report";
const assignToUserId =
  process.env.MODERATION_DRILL_ASSIGN_TO_USER_ID?.trim() || adminUserId;
const assignReason =
  process.env.MODERATION_DRILL_ASSIGN_REASON?.trim() ||
  "moderation drill assignment";
const triageAction = process.env.MODERATION_DRILL_ACTION?.trim() || "resolve";
const triageReason =
  process.env.MODERATION_DRILL_TRIAGE_REASON?.trim() ||
  "moderation drill triage";
const strikeReason =
  process.env.MODERATION_DRILL_STRIKE_REASON?.trim() ||
  "moderation drill strike";
const strikeSeverity = Number(
  process.env.MODERATION_DRILL_STRIKE_SEVERITY || 2,
);
const auditLimit = Number(process.env.MODERATION_DRILL_AUDIT_LIMIT || 250);
const queueLimit = Number(process.env.MODERATION_DRILL_QUEUE_LIMIT || 250);

const drillArtifact = {
  runId,
  generatedAt: new Date().toISOString(),
  baseUrl,
  config: {
    adminUserId,
    adminRole,
    entityType,
    entityId,
    triageAction,
    queueLimit,
    auditLimit,
    queuePollTimeoutMs,
    queuePollIntervalMs,
    auditPollTimeoutMs,
    auditPollIntervalMs,
    enforcementPollTimeoutMs,
    enforcementPollIntervalMs,
  },
  ids: {
    flagId: null,
    reportId: null,
    reporterUserId: null,
    targetUserId: null,
    assignToUserId,
  },
  timings: {
    totalMs: 0,
    reportMs: null,
    queuePollMs: null,
    assignmentMs: null,
    triageMs: null,
    auditPollMs: null,
    enforcementPollMs: null,
  },
  attempts: {
    queuePolls: 0,
    auditPolls: 0,
    enforcementPolls: 0,
  },
  evidence: {
    reportCreated: false,
    queueVerified: false,
    assignmentVerified: false,
    triageVerified: false,
    auditVerified: false,
    enforcementVerified: null,
  },
  enforcementPath: null,
  failureReason: null,
  steps: [],
  success: false,
};

function persistArtifact() {
  mkdirSync(artifactDir, { recursive: true });
  writeFileSync(artifactPath, JSON.stringify(drillArtifact, null, 2));
}

function recordStep(step) {
  drillArtifact.steps.push({
    at: new Date().toISOString(),
    ...step,
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollUntil(label, poller, options) {
  const startedAt = Date.now();
  const timeoutMs = Math.max(1, Number(options.timeoutMs || 0));
  const intervalMs = Math.max(1, Number(options.intervalMs || 250));
  let attempts = 0;
  let lastError = null;

  while (Date.now() - startedAt <= timeoutMs) {
    attempts += 1;
    try {
      const result = await poller(attempts);
      if (result.found) {
        return {
          ...result,
          attempts,
          elapsedMs: Date.now() - startedAt,
          lastError,
        };
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    if (Date.now() - startedAt + intervalMs > timeoutMs) {
      break;
    }
    await sleep(intervalMs);
  }

  return {
    found: false,
    attempts,
    elapsedMs: Date.now() - startedAt,
    lastError,
  };
}

function buildHeaders({
  admin = false,
  accessToken = "",
  forwardedIndex = 0,
} = {}) {
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "x-forwarded-for": `198.51.100.${40 + forwardedIndex}`,
  };

  if (admin) {
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

async function requestJson(method, path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: buildHeaders(options),
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
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
      ok: response.ok,
      status: response.status,
      elapsedMs: Date.now() - startedAt,
      body: parsed,
    };
  } catch (error) {
    clearTimeout(timeout);
    return {
      ok: false,
      status: null,
      elapsedMs: Date.now() - startedAt,
      body: {
        error:
          error instanceof Error
            ? error.message
            : `request_failed:${String(error)}`,
      },
    };
  }
}

function requireEnv(name, value) {
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
}

function parseDataEnvelope(result, label) {
  const payload = result.body;
  if (!payload || typeof payload !== "object") {
    throw new Error(`${label} returned no JSON payload`);
  }

  if (!result.ok) {
    throw new Error(
      `${label} failed (${result.status ?? "ERR"}): ${JSON.stringify(payload).slice(0, 280)}`,
    );
  }

  if (!("data" in payload)) {
    throw new Error(`${label} payload is missing data envelope`);
  }

  return payload.data;
}

function printConfig() {
  console.log("Moderation drill config:");
  console.log(`- baseUrl: ${baseUrl}`);
  console.log(`- adminUserId: ${adminUserId}`);
  console.log(`- adminRole: ${adminRole}`);
  console.log(`- adminApiKey: ${adminApiKey ? "set" : "unset"}`);
  console.log(`- adminAccessToken: ${adminAccessToken ? "set" : "unset"}`);
  console.log(`- timeoutMs: ${timeoutMs}`);
  console.log(`- existingFlagId: ${existingFlagId || "unset"}`);
  console.log(`- reporterUserId: ${reporterUserId || "unset"}`);
  console.log(
    `- reporterAccessToken: ${reporterAccessToken ? "set" : "unset"}`,
  );
  console.log(`- targetUserId: ${targetUserId || "unset"}`);
  console.log(`- entityType: ${entityType}`);
  console.log(`- entityId: ${entityId || "unset"}`);
  console.log(`- triageAction: ${triageAction}`);
  console.log(`- queueLimit: ${queueLimit}`);
  console.log(`- auditLimit: ${auditLimit}`);
  console.log("");
}

async function resolveFlagId() {
  if (existingFlagId) {
    return {
      flagId: existingFlagId,
      reportId: null,
      reportCreated: false,
    };
  }

  requireEnv("MODERATION_DRILL_REPORTER_USER_ID", reporterUserId);
  requireEnv("MODERATION_DRILL_TARGET_USER_ID", targetUserId);
  requireEnv("MODERATION_DRILL_ACCESS_TOKEN", reporterAccessToken);
  requireEnv("MODERATION_DRILL_ENTITY_ID", entityId);

  const reportStartedAt = Date.now();
  let reportResult = await requestJson("POST", "/api/moderation/reports", {
    accessToken: reporterAccessToken,
    forwardedIndex: 0,
    body: {
      reporterUserId,
      targetUserId,
      reason: reportReason,
      details: reportDetails,
      entityType,
      entityId,
    },
  });
  if (
    reportResult.status === 401 &&
    smokeApplicationKey &&
    smokeApplicationToken
  ) {
    const refreshed = await exchangeSmokeSessionWithApplicationCredentials();
    reporterAccessToken = refreshed.accessToken;
    reporterUserId = refreshed.userId;
    reportResult = await requestJson("POST", "/api/moderation/reports", {
      accessToken: reporterAccessToken,
      forwardedIndex: 0,
      body: {
        reporterUserId,
        targetUserId,
        reason: reportReason,
        details: reportDetails,
        entityType,
        entityId,
      },
    });
  }
  drillArtifact.timings.reportMs = Date.now() - reportStartedAt;
  const reportData = parseDataEnvelope(reportResult, "create report");
  const flagId =
    reportData && typeof reportData === "object"
      ? reportData.moderationFlagId
      : null;

  if (typeof flagId !== "string" || flagId.length === 0) {
    throw new Error(
      "create report succeeded but did not return moderationFlagId; provide MODERATION_DRILL_EXISTING_FLAG_ID or entityType/entityId that produce a moderation flag",
    );
  }

  const reportId =
    reportData && typeof reportData === "object" ? reportData.report?.id : null;

  console.log(
    `Created moderation report${typeof reportId === "string" ? ` ${reportId}` : ""} and flag ${flagId}.`,
  );

  drillArtifact.ids.flagId = flagId;
  drillArtifact.ids.reportId = typeof reportId === "string" ? reportId : null;
  drillArtifact.ids.reporterUserId = reporterUserId;
  drillArtifact.ids.targetUserId = targetUserId;
  drillArtifact.evidence.reportCreated = true;
  drillArtifact.enforcementPath = {
    triageAction: triageAction || "resolve",
    targetUserId: targetUserId || null,
    outcome: null,
  };
  recordStep({
    stage: "report",
    status: "completed",
    flagId,
    reportId: typeof reportId === "string" ? reportId : null,
    reportAuth: reporterAccessToken ? "present" : "missing",
    durationMs: drillArtifact.timings.reportMs,
  });

  return {
    flagId,
    reportId: typeof reportId === "string" ? reportId : null,
    reportCreated: true,
  };
}

async function exchangeSmokeSessionWithApplicationCredentials() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}/api/admin/ops/smoke-session/exchange`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "x-application-key": smokeApplicationKey,
        "x-application-token": smokeApplicationToken,
      },
      body: JSON.stringify({ smokeBaseUrl: baseUrl }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload || typeof payload !== "object" || !("data" in payload)) {
      throw new Error(
        `smoke session exchange failed (${response.status}): ${JSON.stringify(payload).slice(0, 280)}`,
      );
    }
    const data = payload.data;
    if (!data || typeof data !== "object") {
      throw new Error("smoke session exchange returned no data");
    }
    const envPayload =
      "env" in data && data.env && typeof data.env === "object" ? data.env : data;
    const accessToken =
      typeof envPayload.SMOKE_ACCESS_TOKEN === "string"
        ? envPayload.SMOKE_ACCESS_TOKEN
        : "";
    const userId =
      typeof envPayload.SMOKE_USER_ID === "string" ? envPayload.SMOKE_USER_ID : "";
    if (!accessToken || !userId) {
      throw new Error("smoke session exchange did not return token and user id");
    }
    console.log("Refreshed moderation drill smoke session via application credentials.");
    return { accessToken, userId };
  } finally {
    clearTimeout(timeout);
  }
}

async function loadModerationQueue() {
  const result = await requestJson(
    "GET",
    `/api/admin/moderation/queue?limit=${queueLimit}&status=open`,
    {
      admin: true,
      accessToken: adminAccessToken,
      forwardedIndex: 1,
    },
  );
  const data = parseDataEnvelope(result, "load moderation queue");
  if (!Array.isArray(data)) {
    throw new Error("moderation queue payload is not an array");
  }
  return data;
}

async function waitForModerationQueueFlag(flagId) {
  const result = await pollUntil(
    `moderation queue flag ${flagId}`,
    async () => {
      const queue = await loadModerationQueue();
      const queuedFlag = queue.find((flag) => flag?.id === flagId);
      if (!queuedFlag) {
        return { found: false, queueCount: queue.length };
      }
      return { found: true, queueCount: queue.length, queuedFlag };
    },
    {
      timeoutMs: queuePollTimeoutMs,
      intervalMs: queuePollIntervalMs,
    },
  );
  drillArtifact.attempts.queuePolls = result.attempts;
  drillArtifact.timings.queuePollMs = result.elapsedMs;
  if (!result.found) {
    throw new Error(
      `moderation flag ${flagId} not found in open queue after ${result.attempts} attempts`,
    );
  }
  recordStep({
    stage: "queue_visibility",
    status: "completed",
    flagId,
    attempts: result.attempts,
    durationMs: result.elapsedMs,
  });
  return result.queuedFlag;
}

async function assignFlag(flagId) {
  const startedAt = Date.now();
  const result = await requestJson(
    "POST",
    `/api/admin/moderation/flags/${flagId}/assign`,
    {
      admin: true,
      accessToken: adminAccessToken,
      forwardedIndex: 2,
      body: {
        assigneeUserId: assignToUserId,
        reason: assignReason,
      },
    },
  );
  drillArtifact.timings.assignmentMs = Date.now() - startedAt;
  const data = parseDataEnvelope(result, "assign moderation flag");
  recordStep({
    stage: "assignment",
    status: "completed",
    flagId,
    assigneeUserId: data?.assigneeUserId ?? null,
    durationMs: drillArtifact.timings.assignmentMs,
  });
  return data;
}

async function triageFlag(flagId) {
  const startedAt = Date.now();
  const body = {
    action: triageAction,
    reason: triageReason,
    ...(targetUserId ? { targetUserId } : {}),
    ...(triageAction === "escalate_strike"
      ? {
          strikeSeverity,
          strikeReason,
        }
      : {}),
  };

  const result = await requestJson(
    "POST",
    `/api/admin/moderation/flags/${flagId}/triage`,
    {
      admin: true,
      accessToken: adminAccessToken,
      forwardedIndex: 3,
      body,
    },
  );
  drillArtifact.timings.triageMs = Date.now() - startedAt;
  const data = parseDataEnvelope(result, "triage moderation flag");
  recordStep({
    stage: "triage",
    status: "completed",
    flagId,
    action: triageAction,
    flagStatus: data?.flag?.status ?? null,
    durationMs: drillArtifact.timings.triageMs,
  });
  return data;
}

async function loadAuditLogs() {
  const result = await requestJson(
    "GET",
    `/api/admin/audit-logs?limit=${auditLimit}`,
    {
      admin: true,
      accessToken: adminAccessToken,
      forwardedIndex: 4,
    },
  );
  const data = parseDataEnvelope(result, "load audit logs");
  if (!Array.isArray(data)) {
    throw new Error("audit log payload is not an array");
  }
  return data;
}

async function waitForAuditEntries(flagId, reportId) {
  const result = await pollUntil(
    `moderation audit log entries for ${flagId}`,
    async () => {
      const logs = await loadAuditLogs();
      const reportAudit = drillArtifact.evidence.reportCreated
        ? findAuditLog(
            logs,
            (entry) =>
              entry.action === "moderation.report_submitted" &&
              entry.entityId === (reportId || flagId),
          )
        : null;
      const assignmentAudit = findAuditLog(
        logs,
        (entry) =>
          entry.action === "admin.moderation_flag_assigned" &&
          entry.entityId === flagId,
      );
      const triageAudit = findAuditLog(
        logs,
        (entry) =>
          entry.action === "admin.action" &&
          entry.entityId === flagId &&
          entry.metadata &&
          typeof entry.metadata === "object" &&
          entry.metadata.action === "admin.moderation_flag_triage",
      );
      const found = Boolean(
        (!drillArtifact.evidence.reportCreated || reportAudit) &&
          assignmentAudit &&
          triageAudit,
      );
      return {
        found,
        logs,
        reportAudit,
        assignmentAudit,
        triageAudit,
      };
    },
    {
      timeoutMs: auditPollTimeoutMs,
      intervalMs: auditPollIntervalMs,
    },
  );
  drillArtifact.attempts.auditPolls = result.attempts;
  drillArtifact.timings.auditPollMs = result.elapsedMs;
  if (!result.found) {
    throw new Error(
      `required audit entries not found after ${result.attempts} attempts${result.lastError ? ` (${result.lastError})` : ""}`,
    );
  }
  recordStep({
    stage: "audit_visibility",
    status: "completed",
    flagId,
    attempts: result.attempts,
    durationMs: result.elapsedMs,
  });
  return result;
}

async function loadUsers() {
  const result = await requestJson("GET", `/api/admin/users?limit=250`, {
    admin: true,
    accessToken: adminAccessToken,
    forwardedIndex: 5,
  });
  const data = parseDataEnvelope(result, "load admin users");
  if (!Array.isArray(data)) {
    throw new Error("admin users payload is not an array");
  }
  return data;
}

async function waitForEnforcement(flagId) {
  if (triageAction !== "restrict_user") {
    return null;
  }
  const result = await pollUntil(
    `moderation enforcement state for ${targetUserId}`,
    async () => {
      const users = await loadUsers();
      const targetUser = users.find((user) => user?.id === targetUserId);
      if (!targetUser) {
        return { found: false, users };
      }
      return {
        found: targetUser.profile?.moderationState === "blocked",
        users,
        targetUser,
      };
    },
    {
      timeoutMs: enforcementPollTimeoutMs,
      intervalMs: enforcementPollIntervalMs,
    },
  );
  drillArtifact.attempts.enforcementPolls = result.attempts;
  drillArtifact.timings.enforcementPollMs = result.elapsedMs;
  if (!result.found) {
    throw new Error(
      `restrict_user did not set moderationState=blocked for ${targetUserId} after ${result.attempts} attempts`,
    );
  }
  recordStep({
    stage: "enforcement",
    status: "completed",
    flagId,
    targetUserId,
    enforcement: "blocked_profile",
    attempts: result.attempts,
    durationMs: result.elapsedMs,
  });
  return result.targetUser;
}

function findAuditLog(logs, predicate) {
  return logs.find((entry) => {
    if (!entry || typeof entry !== "object") {
      return false;
    }
    return predicate(entry);
  });
}

async function main() {
  printConfig();

  const { flagId, reportId } = await resolveFlagId();

  await waitForModerationQueueFlag(flagId);
  drillArtifact.evidence.queueVerified = true;

  const assignment = await assignFlag(flagId);
  if (assignment?.assigneeUserId !== assignToUserId) {
    throw new Error(`assignment did not persist assignee ${assignToUserId}`);
  }
  drillArtifact.evidence.assignmentVerified = true;

  const triage = await triageFlag(flagId);
  const triagedFlag = triage?.flag;
  if (!triagedFlag || triagedFlag.id !== flagId) {
    throw new Error("triage response did not include the expected flag");
  }

  if (triageAction === "resolve" && triagedFlag.status !== "resolved") {
    throw new Error("resolve triage did not move flag to resolved");
  }
  if (triageAction === "reopen" && triagedFlag.status !== "open") {
    throw new Error("reopen triage did not move flag to open");
  }
  if (
    (triageAction === "restrict_user" || triageAction === "escalate_strike") &&
    triagedFlag.status !== "resolved"
  ) {
    throw new Error(`${triageAction} did not resolve the flag`);
  }
  drillArtifact.evidence.triageVerified = true;

  const auditWait = await waitForAuditEntries(flagId, reportId);
  const { logs } = auditWait;

  if (triageAction === "restrict_user") {
    requireEnv("MODERATION_DRILL_TARGET_USER_ID", targetUserId);
    await waitForEnforcement(flagId);
    drillArtifact.evidence.enforcementVerified = "blocked_profile";
  } else if (triageAction === "escalate_strike") {
    const strikeAudit = findAuditLog(
      logs,
      (entry) =>
        entry.action === "moderation.strike_issued" &&
        entry.entityId === targetUserId,
    );
    if (!strikeAudit) {
      throw new Error("strike issuance audit record was not found");
    }
    drillArtifact.evidence.enforcementVerified = "strike_audit";
    recordStep({
      stage: "enforcement",
      status: "completed",
      flagId,
      enforcement: "strike_audit",
      durationMs: 0,
    });
  }

  drillArtifact.evidence.auditVerified = true;
  drillArtifact.success = true;
  drillArtifact.enforcementPath = {
    triageAction,
    targetUserId: targetUserId || null,
    outcome: drillArtifact.evidence.enforcementVerified,
  };
  drillArtifact.ids.flagId = flagId;
  drillArtifact.ids.reportId = reportId;
  drillArtifact.timings.totalMs = Date.now() - new Date(drillArtifact.generatedAt).getTime();
  persistArtifact();

  console.log("");
  console.log("Moderation drill passed.");
  console.log(JSON.stringify(drillArtifact, null, 2));
}

try {
  await main();
} catch (error) {
  drillArtifact.success = false;
  drillArtifact.failureReason =
    error instanceof Error ? error.message : String(error);
  drillArtifact.timings.totalMs =
    Date.now() - new Date(drillArtifact.generatedAt).getTime();
  try {
    persistArtifact();
  } catch {}
  console.error("");
  console.error("Moderation drill failed.");
  console.error(drillArtifact.failureReason);
  process.exitCode = 1;
}
