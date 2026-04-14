#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";

import { buildSystemMatrixStatus } from "./matrix-status.mjs";

const DEFAULT_BASELINE_HISTORY_PATH =
  "scripts/evals/system/system-baseline-history.json";

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
    baselineHistoryPath: path.resolve(
      process.cwd(),
      normalizeString(
        flags.get("history") ?? env.EVAL_SYSTEM_BASELINE_HISTORY_PATH,
        DEFAULT_BASELINE_HISTORY_PATH,
      ),
    ),
    failOnRegression:
      normalizeString(
        flags.get("fail-on-regression") ?? env.EVAL_SYSTEM_FAIL_ON_REGRESSION,
        "0",
      ) === "1",
  };
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function toDelta(current, baseline) {
  const left = Number(current ?? 0);
  const right = Number(baseline ?? 0);
  return Number((left - right).toFixed(3));
}

function deltaStatus(delta) {
  if (delta > 0.001) return "improved";
  if (delta < -0.001) return "regressed";
  return "flat";
}

export function compareSystemBaseline(
  argv = process.argv.slice(2),
  env = process.env,
) {
  const config = parseArgs(argv, env);
  const history = readJson(config.baselineHistoryPath);
  const acceptedBaseline = Array.isArray(history.acceptedRuns)
    ? (history.acceptedRuns[history.acceptedRuns.length - 1] ?? null)
    : null;
  if (!acceptedBaseline) {
    throw new Error(
      `No accepted baseline found in ${config.baselineHistoryPath}.`,
    );
  }

  const current = buildSystemMatrixStatus(argv, env);
  const suiteBaselineScores = acceptedBaseline.suiteScores ?? {};

  const result = {
    generatedAt: new Date().toISOString(),
    baselineHistoryPath: config.baselineHistoryPath,
    acceptedBaselineId: acceptedBaseline.id,
    currentSystemRunDir: current.systemRunDir,
    systemDelta: {
      currentAverageScore: current.system.averageScore ?? 0,
      baselineAverageScore: acceptedBaseline.system?.averageScore ?? 0,
      currentGateScore:
        current.system.gateScore ?? current.system.averageScore ?? 0,
      baselineGateScore:
        acceptedBaseline.system?.gateScore ??
        acceptedBaseline.system?.averageScore ??
        0,
      delta: toDelta(
        current.system.averageScore,
        acceptedBaseline.system?.averageScore,
      ),
      status: deltaStatus(
        toDelta(
          current.system.averageScore,
          acceptedBaseline.system?.averageScore,
        ),
      ),
    },
    gateScoreDelta: {
      currentGateScore:
        current.system.gateScore ?? current.system.averageScore ?? 0,
      baselineGateScore:
        acceptedBaseline.system?.gateScore ??
        acceptedBaseline.system?.averageScore ??
        0,
      delta: toDelta(
        current.system.gateScore ?? current.system.averageScore,
        acceptedBaseline.system?.gateScore ??
          acceptedBaseline.system?.averageScore,
      ),
      status: deltaStatus(
        toDelta(
          current.system.gateScore ?? current.system.averageScore,
          acceptedBaseline.system?.gateScore ??
            acceptedBaseline.system?.averageScore,
        ),
      ),
    },
    socialSimulationDelta: current.socialSimulation
      ? {
          currentMeanScore: current.socialSimulation.meanScore ?? 0,
          baselineMeanScore: acceptedBaseline.socialSimulation?.meanScore ?? 0,
          delta: toDelta(
            current.socialSimulation.meanScore,
            acceptedBaseline.socialSimulation?.meanScore,
          ),
          status: deltaStatus(
            toDelta(
              current.socialSimulation.meanScore,
              acceptedBaseline.socialSimulation?.meanScore,
            ),
          ),
        }
      : null,
    liveSocialSimulationDelta: current.liveSocialSimulation
      ? {
          currentMeanScore: current.liveSocialSimulation.meanScore ?? 0,
          baselineMeanScore:
            acceptedBaseline.liveSocialSimulation?.meanScore ?? 0,
          delta: toDelta(
            current.liveSocialSimulation.meanScore,
            acceptedBaseline.liveSocialSimulation?.meanScore,
          ),
          status: deltaStatus(
            toDelta(
              current.liveSocialSimulation.meanScore,
              acceptedBaseline.liveSocialSimulation?.meanScore,
            ),
          ),
        }
      : null,
    suiteDeltas: current.suiteMatrix.map((suite) => {
      const baselineScore = suiteBaselineScores[suite.suiteId] ?? null;
      const delta =
        baselineScore == null ? null : toDelta(suite.score, baselineScore);
      return {
        suiteId: suite.suiteId,
        currentScore: suite.score,
        baselineScore,
        delta,
        status: delta == null ? "new" : deltaStatus(delta),
      };
    }),
  };

  const regressions = [];
  if (result.gateScoreDelta.status === "regressed") {
    regressions.push(
      `gateScore regressed (${result.gateScoreDelta.currentGateScore} < ${result.gateScoreDelta.baselineGateScore})`,
    );
  }
  if (result.socialSimulationDelta?.status === "regressed") {
    regressions.push(
      `social-sim deterministic mean regressed (${result.socialSimulationDelta.currentMeanScore} < ${result.socialSimulationDelta.baselineMeanScore})`,
    );
  }
  if (
    acceptedBaseline.liveSocialSimulation &&
    !result.liveSocialSimulationDelta
  ) {
    regressions.push(
      "live social-sim baseline exists but current run has no live social-sim lane",
    );
  } else if (result.liveSocialSimulationDelta?.status === "regressed") {
    regressions.push(
      `social-sim live mean regressed (${result.liveSocialSimulationDelta.currentMeanScore} < ${result.liveSocialSimulationDelta.baselineMeanScore})`,
    );
  }
  for (const suiteDelta of result.suiteDeltas) {
    if (suiteDelta.status === "regressed") {
      regressions.push(
        `suite ${suiteDelta.suiteId} regressed (${suiteDelta.currentScore} < ${suiteDelta.baselineScore})`,
      );
    }
  }
  result.regressions = regressions;
  result.passed = regressions.length === 0;
  result.config = {
    failOnRegression: config.failOnRegression,
  };
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = compareSystemBaseline();
  console.log(JSON.stringify(result, null, 2));
  if (result.config.failOnRegression && result.regressions.length > 0) {
    throw new Error(
      `System baseline regression detected: ${result.regressions.join("; ")}`,
    );
  }
}
