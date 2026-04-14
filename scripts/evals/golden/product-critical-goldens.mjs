#!/usr/bin/env node

import { mkdtempSync, readFileSync, readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fetchAgenticEvalSnapshot } from "../online/fetch-agentic-evals-snapshot.mjs";

import {
  createEvalRunEnvelope,
  finalizeEvalRun,
  summarizeCaseRows,
} from "../shared/artifacts.mjs";

const DEFAULT_MANIFEST_PATH =
  "scripts/evals/golden/product-critical-manifest.json";

function normalizeString(value, fallback = "") {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : fallback;
}

function boolFromEnv(value, fallback = false) {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
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
    dryRun: boolFromEnv(
      flags.get("dry-run") ?? env.GOLDEN_PRODUCT_DRY_RUN,
      false,
    ),
    layer: normalizeString(
      flags.get("layer") ?? env.GOLDEN_PRODUCT_LAYER,
      "eval",
    ),
    source: normalizeString(
      flags.get("source") ?? env.GOLDEN_PRODUCT_SOURCE,
      "agent-suite",
    ),
    artifactPath: normalizeString(
      flags.get("artifact-path") ?? env.GOLDEN_PRODUCT_ARTIFACT_PATH,
      "",
    ),
    manifestPath: path.resolve(
      process.cwd(),
      normalizeString(
        flags.get("manifest") ?? env.GOLDEN_PRODUCT_MANIFEST_PATH,
        DEFAULT_MANIFEST_PATH,
      ),
    ),
  };
}

function loadManifest(manifestPath) {
  try {
    return JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    return { version: 1, layers: {} };
  }
}

function runProductGoldenCommand(layer, artifactDir) {
  const command = spawnSync(
    "node",
    ["scripts/run-agent-test-suite.mjs", `--layer=${layer}`],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        AGENT_TEST_SUITE_ARTIFACT_DIR: artifactDir,
      },
    },
  );
  return {
    status: command.status ?? 1,
    stdout: command.stdout ?? "",
    stderr: command.stderr ?? "",
  };
}

function normalizeSnapshotArtifact(snapshot) {
  const scenarios = Array.isArray(snapshot?.scenarios)
    ? snapshot.scenarios
    : [];
  const regressions = Array.isArray(snapshot?.regressions)
    ? snapshot.regressions
    : [];
  const failureClasses = regressions.reduce((current, regression) => {
    const key = normalizeString(regression?.key, "");
    if (!key) return current;
    current[key] = (current[key] ?? 0) + 1;
    return current;
  }, {});

  return {
    source: "agentic-evals-snapshot",
    cases: [
      {
        id: "agentic-evals-snapshot",
        status:
          normalizeString(snapshot?.summary?.status, "unknown") === "healthy"
            ? "passed"
            : "failed",
      },
    ],
    records: scenarios.map((scenario) => ({
      scenarioId: normalizeString(scenario?.scenarioId, scenario?.id ?? ""),
      status: scenario?.passed === true ? "passed" : "failed",
      failureClass:
        scenario?.passed === true
          ? null
          : (regressions[0]?.key ?? "eval_scenario_failed"),
    })),
    summary: {
      caseCounts: {
        total: 1,
        passed:
          normalizeString(snapshot?.summary?.status, "unknown") === "healthy"
            ? 1
            : 0,
        failed:
          normalizeString(snapshot?.summary?.status, "unknown") === "healthy"
            ? 0
            : 1,
        skipped: 0,
      },
      recordCounts: {
        total: scenarios.length,
        passed: scenarios.filter((scenario) => scenario?.passed === true)
          .length,
        failed: scenarios.filter((scenario) => scenario?.passed !== true)
          .length,
        skipped: 0,
      },
      failureClasses,
    },
    snapshot,
  };
}

function loadArtifactFromPath(source, artifactPath) {
  const payload = JSON.parse(readFileSync(artifactPath, "utf8"));
  return source === "agentic-evals-snapshot"
    ? normalizeSnapshotArtifact(payload)
    : payload;
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

  return candidates.sort().at(-1) ?? null;
}

export async function runProductCriticalGoldens(
  argv = process.argv.slice(2),
  env = process.env,
) {
  const config = parseArgs(argv, env);
  const envelope = createEvalRunEnvelope({
    evalSuite: "product-critical-goldens",
    evalType: "golden",
    artifactRoot: env.EVAL_ARTIFACT_ROOT,
  });
  const manifest = loadManifest(config.manifestPath);
  const layerManifest = manifest?.layers?.[config.layer] ?? {};

  let commandResult;
  let suiteArtifact = null;
  if (config.artifactPath) {
    commandResult = {
      status: 0,
      stdout: "artifact-backed product critical golden suite",
      stderr: "",
    };
    try {
      suiteArtifact = loadArtifactFromPath(config.source, config.artifactPath);
    } catch {
      suiteArtifact = null;
    }
  } else if (config.dryRun) {
    commandResult = {
      status: 0,
      stdout: "dry-run product critical golden suite",
      stderr: "",
    };
  } else {
    const suiteArtifactDir = mkdtempSync(
      path.join(os.tmpdir(), `product-goldens-${config.layer}-`),
    );
    if (config.source === "agentic-evals-snapshot") {
      try {
        const outputPath = path.join(
          suiteArtifactDir,
          "agentic-evals-snapshot.json",
        );
        await fetchAgenticEvalSnapshot([`--output=${outputPath}`], env);
        suiteArtifact = loadArtifactFromPath(config.source, outputPath);
        commandResult = {
          status: 0,
          stdout: "live agentic eval snapshot fetched",
          stderr: "",
        };
      } catch (error) {
        commandResult = {
          status: 1,
          stdout: "",
          stderr: error instanceof Error ? error.message : String(error),
        };
        suiteArtifact = null;
      }
    } else {
      commandResult = runProductGoldenCommand(config.layer, suiteArtifactDir);
      try {
        const artifactPath = findLatestJsonArtifact(suiteArtifactDir);
        suiteArtifact = JSON.parse(readFileSync(artifactPath, "utf8"));
      } catch {
        suiteArtifact = null;
      }
    }
  }

  const caseCounts = suiteArtifact?.summary?.caseCounts ?? null;
  const failureClasses = suiteArtifact?.summary?.failureClasses ?? null;
  const suiteCases = Array.isArray(suiteArtifact?.cases)
    ? suiteArtifact.cases
    : [];
  const suiteRecords = Array.isArray(suiteArtifact?.records)
    ? suiteArtifact.records
    : [];
  const caseIds = Array.from(
    new Set(
      suiteCases
        ? suiteCases
            .map((entry) => (typeof entry?.id === "string" ? entry.id : null))
            .filter(Boolean)
        : [],
    ),
  );
  const scenarioIds = Array.from(
    new Set(
      suiteRecords
        ? suiteRecords
            .map((record) =>
              typeof record?.scenarioId === "string" ? record.scenarioId : null,
            )
            .filter(Boolean)
        : [],
    ),
  );
  const requiredScenarioIds = Array.isArray(layerManifest.requiredScenarioIds)
    ? layerManifest.requiredScenarioIds.filter(
        (value) => typeof value === "string",
      )
    : [];
  const requiredCheckIds = Array.isArray(layerManifest.requiredCheckIds)
    ? layerManifest.requiredCheckIds.filter(
        (value) => typeof value === "string",
      )
    : [];
  const requiredPassedCheckIds = Array.isArray(
    layerManifest.requiredPassedCheckIds,
  )
    ? layerManifest.requiredPassedCheckIds.filter(
        (value) => typeof value === "string",
      )
    : [];
  const forbiddenFailureClasses = Array.isArray(
    layerManifest.forbiddenFailureClasses,
  )
    ? layerManifest.forbiddenFailureClasses.filter(
        (value) => typeof value === "string",
      )
    : [];
  const requiredPassedScenarioIds = Array.isArray(
    layerManifest.requiredPassedScenarioIds,
  )
    ? layerManifest.requiredPassedScenarioIds.filter(
        (value) => typeof value === "string",
      )
    : [];
  const passedCheckIds = new Set(
    suiteCases
      .filter((entry) => entry?.status === "passed")
      .map((entry) => (typeof entry?.id === "string" ? entry.id : null))
      .filter(Boolean),
  );
  const passedScenarioIds = new Set(
    suiteRecords
      .filter((record) => record?.status === "passed")
      .map((record) =>
        typeof record?.scenarioId === "string" ? record.scenarioId : null,
      )
      .filter(Boolean),
  );
  const missingScenarioIds = requiredScenarioIds.filter(
    (scenarioId) => !scenarioIds.includes(scenarioId),
  );
  const missingCheckIds = requiredCheckIds.filter(
    (checkId) => !caseIds.includes(checkId),
  );
  const missingPassedCheckIds = requiredPassedCheckIds.filter(
    (checkId) => !passedCheckIds.has(checkId),
  );
  const missingPassedScenarioIds = requiredPassedScenarioIds.filter(
    (scenarioId) => !passedScenarioIds.has(scenarioId),
  );
  const caseCountPass =
    !Number.isFinite(layerManifest.minCaseCount) ||
    (caseCounts?.total ?? 0) >= layerManifest.minCaseCount;
  const recordCountPass =
    !Number.isFinite(layerManifest.minRecordCount) ||
    (suiteArtifact?.summary?.recordCounts?.total ?? 0) >=
      layerManifest.minRecordCount;
  const failedCaseCountPass =
    !Number.isFinite(layerManifest.maxFailedCases) ||
    (caseCounts?.failed ?? 0) <= layerManifest.maxFailedCases;
  const failedRecordCountPass =
    !Number.isFinite(layerManifest.maxFailedRecords) ||
    (suiteArtifact?.summary?.recordCounts?.failed ?? 0) <=
      layerManifest.maxFailedRecords;
  const scenarioCoveragePass = missingScenarioIds.length === 0;
  const checkCoveragePass = missingCheckIds.length === 0;
  const passedCheckCoveragePass = missingPassedCheckIds.length === 0;
  const passedScenarioCoveragePass = missingPassedScenarioIds.length === 0;
  const forbiddenFailureClassMatches = forbiddenFailureClasses.filter(
    (failureClass) => Number(failureClasses?.[failureClass] ?? 0) > 0,
  );
  const failureClassPass = forbiddenFailureClassMatches.length === 0;
  const passed =
    config.dryRun ||
    (commandResult.status === 0 &&
      caseCountPass &&
      recordCountPass &&
      failedCaseCountPass &&
      failedRecordCountPass &&
      scenarioCoveragePass &&
      checkCoveragePass &&
      passedCheckCoveragePass &&
      passedScenarioCoveragePass &&
      failureClassPass);
  const baseScore =
    typeof caseCounts?.total === "number" && caseCounts.total > 0
      ? Number((caseCounts.passed / caseCounts.total).toFixed(3))
      : 0;
  const normalizedScore =
    passed && config.source === "agentic-evals-snapshot"
      ? Number(
          (Number.isFinite(suiteArtifact?.snapshot?.summary?.score)
            ? suiteArtifact.snapshot.summary.score
            : baseScore || 1
          ).toFixed(3),
        )
      : passed
        ? baseScore || 1
        : baseScore;
  const caseRows = [
    {
      caseId: `product-critical-${config.layer}`,
      status: passed ? "passed" : "failed",
      score: normalizedScore,
      primaryFailureReason: passed
        ? "none"
        : !caseCountPass
          ? "case_count_below_threshold"
          : !recordCountPass
            ? "record_count_below_threshold"
            : !failedCaseCountPass
              ? "too_many_failed_cases"
              : !failedRecordCountPass
                ? "too_many_failed_records"
                : !checkCoveragePass
                  ? "missing_required_checks"
                  : !passedCheckCoveragePass
                    ? "required_checks_not_passing"
                    : !passedScenarioCoveragePass
                      ? "required_scenarios_not_passing"
                      : !failureClassPass
                        ? "forbidden_failure_class_present"
                        : !scenarioCoveragePass
                          ? "missing_required_scenarios"
                          : (Object.entries(failureClasses ?? {}).sort(
                              (left, right) => right[1] - left[1],
                            )[0]?.[0] ??
                            `agent-test-suite-${config.layer}-failed`),
      layer: config.layer,
      source: config.source,
      command: `node scripts/run-agent-test-suite.mjs --layer=${config.layer}`,
      stdout: commandResult.stdout,
      stderr: commandResult.stderr,
      suiteSummary: suiteArtifact?.summary ?? null,
      missingScenarioIds,
      missingCheckIds,
      assertionsEvaluated: !config.dryRun,
      missingPassedCheckIds,
      missingPassedScenarioIds,
      forbiddenFailureClassMatches,
    },
  ];

  const summary = {
    ...summarizeCaseRows(caseRows),
    layer: config.layer,
    source: config.source,
    suiteSummary: suiteArtifact?.summary ?? null,
    dryRunBypassedAssertions: config.dryRun,
    assertionsEvaluated: !config.dryRun,
    requiredCheckIds,
    missingCheckIds,
    requiredPassedCheckIds,
    missingPassedCheckIds,
    requiredScenarioIds,
    missingScenarioIds,
    requiredPassedScenarioIds,
    missingPassedScenarioIds,
    forbiddenFailureClasses,
    forbiddenFailureClassMatches,
  };

  return finalizeEvalRun(envelope, summary, caseRows, {
    suiteArtifact,
    manifestPath: config.manifestPath,
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await runProductCriticalGoldens();
  console.log(JSON.stringify(result.summary, null, 2));
  console.log(`artifact written to ${path.join(result.runDir, "run.json")}`);
}
