#!/usr/bin/env node

import path from "node:path";
import { parseSocialSimArgs } from "../../social-sim-core.mjs";
import {
  createEvalRunEnvelope,
  finalizeEvalRun,
  summarizeCaseRows,
} from "../shared/artifacts.mjs";
import { runSocialSimBenchmarkMatrix } from "./social-sim-benchmark.mjs";
import { runProductCriticalGoldens } from "./product-critical-goldens.mjs";

function parseGoldenArgs(argv = process.argv.slice(2)) {
  const suites = [];
  for (const arg of argv) {
    if (!arg.startsWith("--suite=")) continue;
    const raw = arg.slice("--suite=".length);
    for (const suite of raw.split(",")) {
      if (suite.trim()) suites.push(suite.trim());
    }
  }
  return {
    suites: suites.length > 0 ? suites : ["social-sim-benchmark", "product-critical-goldens"],
  };
}

export async function runGoldenEvals(argv = process.argv.slice(2), env = process.env) {
  const goldenArgs = parseGoldenArgs(argv);
  const socialSimConfig = parseSocialSimArgs(argv, env);
  const envelope = createEvalRunEnvelope({
    evalSuite: "golden-evals",
    evalType: "golden",
    artifactRoot: env.EVAL_ARTIFACT_ROOT,
  });

  const caseRows = [];
  const suiteSummaries = [];

  if (goldenArgs.suites.includes("social-sim-benchmark")) {
    const socialSimResult = await runSocialSimBenchmarkMatrix(argv, {
      ...env,
      EVAL_ARTIFACT_ROOT: path.join(envelope.runDir, "suite-artifacts"),
    });
    suiteSummaries.push({
      suite: "social-sim-benchmark",
      summary: socialSimResult.summary,
      run: {
        runId: socialSimResult.runId,
        benchmarkConfig: socialSimResult.benchmarkConfig ?? null,
      },
    });
    caseRows.push({
      caseId: "suite-social-sim-benchmark",
      status: socialSimResult.summary.failedCases > 0 ? "failed" : "passed",
      score: socialSimResult.summary.meanScore,
      primaryFailureReason: socialSimResult.summary.primaryFailureReason,
      provider: socialSimConfig.provider,
      judgeProvider: socialSimConfig.judgeProvider,
      suiteArtifactRunId: socialSimResult.runId,
    });
  }

  if (goldenArgs.suites.includes("product-critical-goldens")) {
    const productResult = await runProductCriticalGoldens(argv, {
      ...env,
      EVAL_ARTIFACT_ROOT: path.join(envelope.runDir, "suite-artifacts"),
    });
    suiteSummaries.push({
      suite: "product-critical-goldens",
      summary: productResult.summary,
      run: {
        runId: productResult.runId,
      },
    });
    caseRows.push({
      caseId: "suite-product-critical-goldens",
      status: productResult.summary.failedCases > 0 ? "failed" : "passed",
      score: productResult.summary.averageScore,
      primaryFailureReason: productResult.summary.primaryFailureReason,
      suiteArtifactRunId: productResult.runId,
    });
  }

  const summary = {
    ...summarizeCaseRows(caseRows),
    suiteCount: suiteSummaries.length,
    suites: suiteSummaries,
  };

  return finalizeEvalRun(envelope, summary, caseRows);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await runGoldenEvals();
  console.log(JSON.stringify(result.summary, null, 2));
  console.log(`artifact written to ${path.join(result.runDir, "run.json")}`);
}
