import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

export const DEFAULT_EVAL_ARTIFACT_ROOT = ".artifacts/evals";

function nowIso() {
  return new Date().toISOString();
}

function normalizeString(value, fallback = "") {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : fallback;
}

export function ensureDir(dirPath) {
  mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

export function writeJsonArtifact(dirPath, filename, payload) {
  ensureDir(dirPath);
  const filePath = path.join(dirPath, filename);
  writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return filePath;
}

export function writeJsonLinesArtifact(dirPath, filename, rows) {
  ensureDir(dirPath);
  const filePath = path.join(dirPath, filename);
  const content = Array.isArray(rows)
    ? `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`
    : "";
  writeFileSync(filePath, content, "utf8");
  return filePath;
}

export function createEvalRunEnvelope(config = {}) {
  const evalSuite = normalizeString(config.evalSuite, "unknown-eval-suite");
  const evalType = normalizeString(config.evalType, "golden");
  const runId = normalizeString(
    config.runId,
    `${evalSuite}-${new Date().toISOString().replace(/[:.]/g, "-")}`,
  );
  const artifactRoot = path.resolve(
    process.cwd(),
    normalizeString(config.artifactRoot, DEFAULT_EVAL_ARTIFACT_ROOT),
  );
  const runDir = ensureDir(path.join(artifactRoot, runId));
  return {
    evalSuite,
    evalType,
    runId,
    runDir,
    artifactRoot,
    startedAt: nowIso(),
  };
}

export function summarizeCaseRows(caseRows = []) {
  const rows = Array.isArray(caseRows) ? caseRows : [];
  const totalCases = rows.length;
  const passedCases = rows.filter((row) => row.status === "passed").length;
  const failedCases = rows.filter((row) => row.status === "failed");
  const scoreSum = rows.reduce(
    (sum, row) => sum + (Number.isFinite(row.score) ? row.score : 0),
    0,
  );
  return {
    totalCases,
    passedCases,
    failedCases: failedCases.length,
    averageScore: Number(
      (totalCases > 0 ? scoreSum / totalCases : 0).toFixed(3),
    ),
    primaryFailureReason:
      failedCases[0]?.primaryFailureReason ??
      failedCases[0]?.reason ??
      (failedCases.length > 0 ? "case_failed" : "none"),
  };
}

export function finalizeEvalRun(envelope, summary, caseRows = [], extra = {}) {
  const completedAt = nowIso();
  const runPayload = {
    runId: envelope.runId,
    evalSuite: envelope.evalSuite,
    evalType: envelope.evalType,
    startedAt: envelope.startedAt,
    completedAt,
    summary,
    ...extra,
  };
  writeJsonArtifact(envelope.runDir, "run.json", runPayload);
  writeJsonArtifact(envelope.runDir, "summary.json", summary);
  writeJsonLinesArtifact(envelope.runDir, "cases.jsonl", caseRows);
  writeJsonLinesArtifact(
    envelope.runDir,
    "failures.jsonl",
    caseRows.filter((row) => row.status === "failed"),
  );
  return {
    ...runPayload,
    runDir: envelope.runDir,
  };
}
