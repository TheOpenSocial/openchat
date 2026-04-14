#!/usr/bin/env node

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import {
  createEvalRunEnvelope,
  finalizeEvalRun,
  summarizeCaseRows,
} from "../shared/artifacts.mjs";

const DEFAULT_EVENTS_PATH = "scripts/evals/online/sample-quality-events.jsonl";

function normalizeString(value, fallback = "") {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : fallback;
}

function parseArgs(argv = process.argv.slice(2), env = process.env) {
  const flags = new Map();
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const withoutPrefix = arg.slice(2);
    const [key, rawValue] = withoutPrefix.split("=", 2);
    flags.set(key, rawValue ?? "true");
  }
  return {
    eventsPath: path.resolve(
      process.cwd(),
      normalizeString(
        flags.get("events") ?? env.EVAL_QUALITY_EVENTS_PATH,
        DEFAULT_EVENTS_PATH,
      ),
    ),
    source: normalizeString(
      flags.get("source") ?? env.EVAL_QUALITY_SOURCE,
      "jsonl",
    ),
  };
}

function parseJsonLines(filePath) {
  const content = readFileSync(filePath, "utf8");
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function findLatestJsonArtifact(fileOrDirPath) {
  const stat = statSync(fileOrDirPath);
  if (!stat.isDirectory()) {
    return fileOrDirPath;
  }

  const candidates = [];
  const stack = [fileOrDirPath];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of readdirSync(current)) {
      const entryPath = path.join(current, entry);
      const entryStat = statSync(entryPath);
      if (entryStat.isDirectory()) {
        stack.push(entryPath);
        continue;
      }
      if (entryPath.endsWith(".json")) {
        candidates.push(entryPath);
      }
    }
  }

  return candidates.sort().at(-1) ?? fileOrDirPath;
}

function parseAgentSuiteArtifact(filePath) {
  const resolvedPath = findLatestJsonArtifact(filePath);
  const artifact = JSON.parse(readFileSync(resolvedPath, "utf8"));
  const records = Array.isArray(artifact?.records) ? artifact.records : [];
  return records.map((record) => ({
    conversation_id:
      record.workflowRunId ?? record.scenarioId ?? record.checkId ?? "unknown",
    message_id:
      record.traceId ?? record.scenarioId ?? record.checkId ?? "unknown",
    channel: record.checkId?.includes("prod-smoke") ? "staging" : "agentic",
    provider: "unknown",
    deploy_sha: normalizeString(process.env.GITHUB_SHA, "local"),
    tool_family: record.failureClass ?? "workflow",
    quality_score:
      record.status === "passed" ? 1 : record.status === "skipped" ? 0.5 : 0,
    retry_count: 0,
    escalated: record.status === "failed",
    failure_taxonomy: record.failureClass ?? "none",
    created_at: new Date().toISOString(),
  }));
}

function parseAgenticEvalSnapshot(filePath) {
  const snapshot = JSON.parse(
    readFileSync(findLatestJsonArtifact(filePath), "utf8"),
  );
  const scenarios = Array.isArray(snapshot?.scenarios)
    ? snapshot.scenarios
    : [];
  const traceGrade = snapshot?.traceGrade ?? {};
  const regressions = Array.isArray(snapshot?.regressions)
    ? snapshot.regressions
    : [];
  const dominantRegression =
    regressions.slice().sort((left, right) => {
      const severityRank = { critical: 2, warning: 1 };
      return (
        (severityRank[right?.severity] ?? 0) -
        (severityRank[left?.severity] ?? 0)
      );
    })[0] ?? null;

  return scenarios.map((scenario) => ({
    conversation_id: snapshot?.generatedAt ?? "agentic-evals-snapshot",
    message_id: scenario?.scenarioId ?? scenario?.id ?? "unknown",
    channel: "admin_eval",
    provider: "unknown",
    deploy_sha: normalizeString(process.env.GITHUB_SHA, "local"),
    tool_family: scenario?.dimension ?? "eval",
    quality_score: Number.isFinite(scenario?.score) ? scenario.score : 0,
    retry_count: 0,
    escalated: scenario?.passed === false,
    failure_taxonomy:
      scenario?.passed === false
        ? (dominantRegression?.key ?? "eval_scenario_failed")
        : "none",
    created_at: snapshot?.generatedAt ?? new Date().toISOString(),
    trace_grade_status: normalizeString(traceGrade?.status, "unknown"),
    trace_grade_score: Number.isFinite(traceGrade?.score)
      ? traceGrade.score
      : null,
    regression_count:
      typeof snapshot?.summary?.regressionCount === "number"
        ? snapshot.summary.regressionCount
        : regressions.length,
  }));
}

function parseRuntimeAdminExport(filePath) {
  const payload = JSON.parse(
    readFileSync(findLatestJsonArtifact(filePath), "utf8"),
  );
  const events = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.events)
      ? payload.events
      : Array.isArray(payload?.rows)
        ? payload.rows
        : [];

  return events.map((event, index) => {
    const qualityScoreCandidate =
      event?.quality_score ??
      event?.qualityScore ??
      event?.quality?.score ??
      null;
    const retryCountCandidate =
      event?.retry_count ??
      event?.retryCount ??
      event?.metrics?.retryCount ??
      0;
    const escalatedCandidate =
      event?.escalated ?? event?.flags?.escalated ?? false;
    const failureTaxonomy = normalizeString(
      event?.failure_taxonomy ??
        event?.failureTaxonomy ??
        event?.failure?.taxonomy,
      "none",
    );

    return {
      conversation_id: normalizeString(
        event?.conversation_id ?? event?.conversationId,
        `runtime-export-${index + 1}`,
      ),
      message_id: normalizeString(
        event?.message_id ?? event?.messageId ?? event?.traceId,
        `message-${index + 1}`,
      ),
      channel: normalizeString(event?.channel, "unknown"),
      provider: normalizeString(event?.provider, "unknown"),
      deploy_sha: normalizeString(
        event?.deploy_sha ?? event?.deploySha,
        "local",
      ),
      tool_family: normalizeString(
        event?.tool_family ?? event?.toolFamily,
        "unknown",
      ),
      quality_score: Number.isFinite(qualityScoreCandidate)
        ? qualityScoreCandidate
        : 0,
      retry_count: Number.isFinite(retryCountCandidate)
        ? retryCountCandidate
        : 0,
      escalated: Boolean(escalatedCandidate),
      failure_taxonomy: failureTaxonomy,
      created_at: normalizeString(
        event?.created_at ?? event?.createdAt,
        new Date().toISOString(),
      ),
      trace_grade_status: normalizeString(
        event?.trace_grade_status ?? event?.traceGradeStatus,
        "unknown",
      ),
    };
  });
}

function parseAgentWorkflowsSnapshot(filePath) {
  const snapshot = JSON.parse(
    readFileSync(findLatestJsonArtifact(filePath), "utf8"),
  );
  const runs = Array.isArray(snapshot?.runs) ? snapshot.runs : [];

  return runs.map((run, index) => {
    const health = normalizeString(run?.health, "unknown");
    const failureTaxonomy = normalizeString(run?.failureClass, "none");
    const qualityScore =
      health === "healthy" ? 1 : health === "watch" ? 0.6 : 0.2;

    return {
      conversation_id: normalizeString(
        run?.workflowRunId,
        `workflow-run-${index + 1}`,
      ),
      message_id: normalizeString(run?.traceId, `trace-${index + 1}`),
      channel: "agent_workflow",
      provider: normalizeString(run?.domain, "unknown"),
      deploy_sha: normalizeString(process.env.GITHUB_SHA, "local"),
      tool_family: failureTaxonomy === "none" ? "workflow" : failureTaxonomy,
      quality_score: qualityScore,
      retry_count: 0,
      escalated: health === "critical",
      failure_taxonomy: failureTaxonomy,
      created_at: normalizeString(
        snapshot?.generatedAt,
        new Date().toISOString(),
      ),
      trace_grade_status: health,
    };
  });
}

function reliabilityStatusScore(status) {
  if (status === "healthy" || status === "passed" || status === "green")
    return 1;
  if (status === "watch" || status === "skipped" || status === "yellow")
    return 0.6;
  if (status === "critical" || status === "failed" || status === "red")
    return 0.2;
  return 0.4;
}

function parseAgentReliabilitySnapshot(filePath) {
  const snapshot = JSON.parse(
    readFileSync(findLatestJsonArtifact(filePath), "utf8"),
  );
  const generatedAt = normalizeString(
    snapshot?.generatedAt,
    new Date().toISOString(),
  );
  const workflowHealth = snapshot?.workflow?.health ?? {};
  const workflowTotal =
    Number(snapshot?.workflow?.totalRuns ?? 0) ||
    Number(workflowHealth.healthy ?? 0) +
      Number(workflowHealth.watch ?? 0) +
      Number(workflowHealth.critical ?? 0);
  const workflowQuality =
    workflowTotal > 0
      ? (Number(workflowHealth.healthy ?? 0) +
          Number(workflowHealth.watch ?? 0) * 0.6 +
          Number(workflowHealth.critical ?? 0) * 0.2) /
        workflowTotal
      : 0;
  const latestVerificationStatus = normalizeString(
    snapshot?.verification?.latest?.status,
    "unknown",
  );

  return [
    {
      conversation_id: generatedAt,
      message_id: "agent_reliability_canary",
      channel: "admin_reliability",
      provider: "agent-reliability-snapshot",
      deploy_sha: normalizeString(process.env.GITHUB_SHA, "local"),
      tool_family: "canary",
      quality_score: reliabilityStatusScore(
        normalizeString(snapshot?.canary?.verdict, "unknown"),
      ),
      retry_count: 0,
      escalated:
        normalizeString(snapshot?.canary?.verdict, "unknown") === "critical",
      failure_taxonomy:
        normalizeString(snapshot?.canary?.verdict, "unknown") === "critical"
          ? "canary_critical"
          : "none",
      created_at: generatedAt,
      trace_grade_status: normalizeString(snapshot?.eval?.status, "unknown"),
    },
    {
      conversation_id: generatedAt,
      message_id: "agent_reliability_workflow_health",
      channel: "admin_reliability",
      provider: "agent-reliability-snapshot",
      deploy_sha: normalizeString(process.env.GITHUB_SHA, "local"),
      tool_family: "workflow_health",
      quality_score: Number(workflowQuality.toFixed(3)),
      retry_count: 0,
      escalated: Number(workflowHealth.critical ?? 0) > 0,
      failure_taxonomy:
        Number(workflowHealth.critical ?? 0) > 0
          ? "workflow_health_critical"
          : "none",
      created_at: generatedAt,
      trace_grade_status: normalizeString(snapshot?.eval?.status, "unknown"),
    },
    {
      conversation_id: generatedAt,
      message_id: "agent_reliability_eval_status",
      channel: "admin_reliability",
      provider: "agent-reliability-snapshot",
      deploy_sha: normalizeString(process.env.GITHUB_SHA, "local"),
      tool_family: "eval_status",
      quality_score: reliabilityStatusScore(
        normalizeString(snapshot?.eval?.status, "unknown"),
      ),
      retry_count: 0,
      escalated:
        normalizeString(snapshot?.eval?.status, "unknown") === "critical",
      failure_taxonomy:
        normalizeString(snapshot?.eval?.status, "unknown") === "critical"
          ? "eval_status_critical"
          : "none",
      created_at: generatedAt,
      trace_grade_status: normalizeString(
        snapshot?.eval?.traceGrade?.status,
        "unknown",
      ),
    },
    {
      conversation_id: generatedAt,
      message_id: "agent_reliability_verification_latest",
      channel: "admin_reliability",
      provider: "agent-reliability-snapshot",
      deploy_sha: normalizeString(process.env.GITHUB_SHA, "local"),
      tool_family: "verification",
      quality_score: reliabilityStatusScore(latestVerificationStatus),
      retry_count: 0,
      escalated: latestVerificationStatus === "failed",
      failure_taxonomy:
        latestVerificationStatus === "failed" ? "verification_failed" : "none",
      created_at: generatedAt,
      trace_grade_status: normalizeString(
        snapshot?.eval?.traceGrade?.status,
        "unknown",
      ),
    },
  ];
}

function average(values) {
  return values.length > 0
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}

function groupCount(rows, key) {
  const grouped = new Map();
  for (const row of rows) {
    const value = normalizeString(row[key], "unknown");
    grouped.set(value, (grouped.get(value) ?? 0) + 1);
  }
  return Object.fromEntries(
    [...grouped.entries()].sort((left, right) => right[1] - left[1]),
  );
}

export async function reportQualityEvents(
  argv = process.argv.slice(2),
  env = process.env,
) {
  const config = parseArgs(argv, env);
  const envelope = createEvalRunEnvelope({
    evalSuite: "online-quality-report",
    evalType: "online",
    artifactRoot: env.EVAL_ARTIFACT_ROOT,
  });
  const rows =
    config.source === "agent-suite"
      ? parseAgentSuiteArtifact(config.eventsPath)
      : config.source === "agentic-evals-snapshot"
        ? parseAgenticEvalSnapshot(config.eventsPath)
        : config.source === "agent-workflows-snapshot"
          ? parseAgentWorkflowsSnapshot(config.eventsPath)
          : config.source === "agent-reliability-snapshot"
            ? parseAgentReliabilitySnapshot(config.eventsPath)
            : config.source === "runtime-admin-export"
              ? parseRuntimeAdminExport(config.eventsPath)
              : parseJsonLines(config.eventsPath);
  const caseRows = rows.map((row) => ({
    caseId: `${row.conversation_id}:${row.message_id}`,
    status: row.quality_score >= 0.6 ? "passed" : "failed",
    score: row.quality_score,
    primaryFailureReason: row.failure_taxonomy ?? "none",
    channel: row.channel,
    provider: row.provider,
    deploySha: row.deploy_sha,
    toolFamily: row.tool_family,
    escalated: Boolean(row.escalated),
    retryCount: Number.isFinite(row.retry_count) ? row.retry_count : 0,
    traceGradeStatus: normalizeString(row.trace_grade_status, "unknown"),
    createdAt: row.created_at,
  }));

  const summary = {
    ...summarizeCaseRows(caseRows),
    source: config.source,
    averageRetryCount: Number(
      average(caseRows.map((row) => row.retryCount ?? 0)).toFixed(3),
    ),
    escalationRate: Number(
      (
        caseRows.filter((row) => row.escalated).length /
        Math.max(caseRows.length, 1)
      ).toFixed(3),
    ),
    byChannel: groupCount(caseRows, "channel"),
    byProvider: groupCount(caseRows, "provider"),
    byToolFamily: groupCount(caseRows, "toolFamily"),
    byFailureTaxonomy: groupCount(caseRows, "primaryFailureReason"),
    byTraceGradeStatus: groupCount(caseRows, "traceGradeStatus"),
  };

  return finalizeEvalRun(envelope, summary, caseRows, {
    eventsPath: config.eventsPath,
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await reportQualityEvents();
  console.log(JSON.stringify(result.summary, null, 2));
  console.log(`artifact written to ${path.join(result.runDir, "run.json")}`);
}
