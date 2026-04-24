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
const adminRole = process.env.SMOKE_ADMIN_ROLE || "support";
const adminApiKey = process.env.SMOKE_ADMIN_API_KEY?.trim() || "";
const accessToken = process.env.SMOKE_ACCESS_TOKEN?.trim() || "";
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS || 15000);
const artifactDir = path.resolve(
  process.cwd(),
  process.env.PROTOCOL_RECOVERY_DRILL_ARTIFACT_DIR?.trim() ||
    ".artifacts/protocol-recovery-drill",
);
const runId =
  process.env.PROTOCOL_RECOVERY_DRILL_RUN_ID?.trim() ||
  `protocol-recovery-drill-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
const artifactPath = path.resolve(artifactDir, `${runId}.json`);

const allowReplay = process.env.PROTOCOL_RECOVERY_ALLOW_REPLAY === "1";
const replayAppId = process.env.PROTOCOL_RECOVERY_APP_ID?.trim() || "";
const replayAppToken = process.env.PROTOCOL_RECOVERY_APP_TOKEN?.trim() || "";
const replayDeliveryId =
  process.env.PROTOCOL_RECOVERY_DELIVERY_ID?.trim() || "";
const replayBatchLimit = Number(
  process.env.PROTOCOL_RECOVERY_REPLAY_BATCH_LIMIT || 10,
);

const artifact = {
  runId,
  generatedAt: new Date().toISOString(),
  baseUrl,
  mode: allowReplay ? "active" : "diagnostic",
  config: {
    adminUserId,
    adminRole,
    timeoutMs,
    allowReplay,
    replayAppId: replayAppId || null,
    replayDeliveryId: replayDeliveryId || null,
    replayBatchLimit,
  },
  evidence: {
    manualVerification: null,
    queueHealthBefore: null,
    queueHealthAfter: null,
    replayAction: null,
  },
  assessment: {
    overallStatus: "unknown",
    findings: [],
    nextActions: [],
  },
  success: false,
  failureReason: null,
};

function persistArtifact() {
  mkdirSync(artifactDir, { recursive: true });
  writeFileSync(artifactPath, JSON.stringify(artifact, null, 2));
}

function buildHeaders({ admin = false, appToken = "" } = {}) {
  const headers = {
    Accept: "application/json",
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

  if (appToken) {
    headers["x-protocol-app-token"] = appToken;
    headers["content-type"] = "application/json";
  }

  return headers;
}

async function requestJson(method, route, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}${route}`, {
      method,
      headers: buildHeaders(options),
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
    const text = await response.text();
    let parsed = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }
    return {
      ok: response.ok,
      status: response.status,
      data: parsed?.data ?? null,
      body: parsed,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function assertOk(response, label) {
  if (!response.ok) {
    throw new Error(
      `${label} failed (${response.status}): ${JSON.stringify(response.body).slice(0, 300)}`,
    );
  }
}

const BLOCKING_FINDING_AREAS = new Set([
  "protocol_queue",
  "protocol_auth",
  "request_pressure",
]);

function deriveAssessment(manualVerification, queueHealthBefore, replayAction) {
  const findings = [];
  const nextActions = [];

  const opsAssessment = manualVerification?.assessment;
  if (opsAssessment && typeof opsAssessment === "object") {
    findings.push(...(opsAssessment.findings ?? []));
    nextActions.push(...(opsAssessment.nextActions ?? []));
  }

  const queueSummary = queueHealthBefore?.summary;
  const replaySummary = queueHealthBefore?.replayCursorSummary;
  if (queueSummary?.deadLetteredCount > 0 && !allowReplay) {
    findings.push({
      id: "protocol_dead_letters_need_replay_plan",
      level: "watch",
      area: "protocol_queue",
      summary:
        "Dead-lettered deliveries are present, but this run was diagnostic only.",
      detail: `${queueSummary.deadLetteredCount} dead-lettered deliveries are currently replayable. Re-run with protocol app credentials to verify active recovery.`,
    });
    nextActions.push({
      id: "rerun_with_protocol_replay",
      label: "Rerun recovery drill with protocol app credentials",
      endpoint: "/protocol/apps/:appId/deliveries/:deliveryId/replay",
      reason:
        "A diagnostic run can prove visibility, but not replay recovery. Use a targeted app token to validate one representative replay safely.",
    });
  }

  if (replaySummary?.staleAppCount > 0) {
    findings.push({
      id: "protocol_replay_cursor_stale_after_check",
      level: "watch",
      area: "protocol_queue",
      summary: "Replay cursor lag is still visible in the queue snapshot.",
      detail: `${replaySummary.staleAppCount} apps have stale replay cursors and may still trail the latest event log even if delivery is draining.`,
    });
  }

  if (replayAction?.ok) {
    findings.push({
      id: "protocol_replay_executed",
      level: "healthy",
      area: "protocol_queue",
      summary: "A protocol replay action was executed during this drill.",
      detail:
        replayAction.mode === "delivery"
          ? `Delivery ${replayAction.deliveryId} was replayed successfully.`
          : `${replayAction.replayedCount} dead-lettered deliveries were replayed in batch successfully.`,
    });
  }

  const blockingFindings = findings.filter(
    (finding) =>
      finding.level === "critical" &&
      BLOCKING_FINDING_AREAS.has(finding.area ?? ""),
  );

  return {
    overallStatus:
      blockingFindings.length > 0
        ? "critical"
        : findings.some((finding) => finding.level === "watch")
          ? "watch"
          : "healthy",
    findings,
    nextActions,
  };
}

async function main() {
  try {
    const manualVerification = await requestJson(
      "GET",
      "/admin/ops/manual-verification",
      {
        admin: true,
      },
    );
    assertOk(manualVerification, "manual verification snapshot");

    const queueHealthBefore = await requestJson(
      "GET",
      "/admin/ops/protocol-queue-health",
      {
        admin: true,
      },
    );
    assertOk(queueHealthBefore, "protocol queue health snapshot");

    artifact.evidence.manualVerification = manualVerification.data;
    artifact.evidence.queueHealthBefore = queueHealthBefore.data;

    if (allowReplay) {
      if (!replayAppId || !replayAppToken) {
        throw new Error(
          "protocol replay drill requires PROTOCOL_RECOVERY_APP_ID and PROTOCOL_RECOVERY_APP_TOKEN when PROTOCOL_RECOVERY_ALLOW_REPLAY=1",
        );
      }

      const targetDeliveryId =
        replayDeliveryId ||
        queueHealthBefore.data?.deadLetterSample?.[0]?.deliveryId ||
        "";

      if (targetDeliveryId) {
        const replayResponse = await requestJson(
          "POST",
          `/protocol/apps/${encodeURIComponent(replayAppId)}/deliveries/${encodeURIComponent(targetDeliveryId)}/replay`,
          {
            appToken: replayAppToken,
            body: {},
          },
        );
        assertOk(replayResponse, "protocol delivery replay");
        artifact.evidence.replayAction = {
          ok: true,
          mode: "delivery",
          deliveryId: targetDeliveryId,
          response: replayResponse.data,
        };
      } else {
        const replayBatch = await requestJson(
          "POST",
          `/protocol/apps/${encodeURIComponent(replayAppId)}/delivery-queue/replay-dead-lettered`,
          {
            appToken: replayAppToken,
            body: { limit: replayBatchLimit },
          },
        );
        assertOk(replayBatch, "protocol dead-letter batch replay");
        artifact.evidence.replayAction = {
          ok: true,
          mode: "batch",
          replayedCount: replayBatch.data?.replayedCount ?? 0,
          response: replayBatch.data,
        };
      }

      const queueHealthAfter = await requestJson(
        "GET",
        "/admin/ops/protocol-queue-health",
        {
          admin: true,
        },
      );
      assertOk(queueHealthAfter, "post-replay queue health snapshot");
      artifact.evidence.queueHealthAfter = queueHealthAfter.data;
    }

    artifact.assessment = deriveAssessment(
      artifact.evidence.manualVerification,
      artifact.evidence.queueHealthBefore,
      artifact.evidence.replayAction,
    );
    if (artifact.assessment.overallStatus === "critical") {
      throw new Error(
        "protocol recovery drill found critical operator-side blockers in the current snapshots",
      );
    }
    artifact.success = true;
    persistArtifact();
    console.log(
      JSON.stringify(
        {
          runId,
          artifactPath,
          overallStatus: artifact.assessment.overallStatus,
          replayExecuted: Boolean(artifact.evidence.replayAction?.ok),
        },
        null,
        2,
      ),
    );
  } catch (error) {
    artifact.failureReason =
      error instanceof Error ? error.message : String(error);
    artifact.assessment = {
      overallStatus: "critical",
      findings: [
        {
          id: "protocol_recovery_drill_failed",
          level: "critical",
          area: "protocol_queue",
          summary: "Protocol recovery drill failed.",
          detail: artifact.failureReason,
        },
      ],
      nextActions: [
        {
          id: "inspect_protocol_recovery_artifact",
          label: "Inspect protocol recovery drill artifact",
          endpoint: artifactPath,
          reason:
            "Use the captured artifact to see which snapshot or replay action failed before retrying the drill.",
        },
      ],
    };
    persistArtifact();
    console.error(artifact.failureReason);
    process.exitCode = 1;
  }
}

await main();
