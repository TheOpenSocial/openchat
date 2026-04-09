import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";

import { acceptSystemBaseline } from "./accept-system-baseline.mjs";

test("acceptSystemBaseline appends accepted run from real summary data", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "accept-system-baseline-"));
  const historyPath = path.join(root, "system-baseline-history.json");
  const summaryPath = path.join(root, "summary.json");
  const runJsonPath = path.join(root, "run.json");

  writeFileSync(
    historyPath,
    JSON.stringify({ version: 1, acceptedRuns: [] }, null, 2),
  );
  writeFileSync(
    summaryPath,
    JSON.stringify(
      {
        averageScore: 0.924,
        gateScore: 0.9559166666666666,
        passed: true,
        usedLiveWorkflowReplay: true,
        usedLiveSocialSim: true,
        suites: [
          {
            suiteId: "social-sim-benchmark",
            summary: {
              meanScore: 0.74,
              scoreStdDev: 0.006,
              worstSeedScore: 0.732,
            },
          },
          {
            suiteId: "social-sim-live-benchmark",
            summary: {
              meanScore: 0.731,
              scoreStdDev: 0.014,
              worstSeedScore: 0.714,
            },
          },
          {
            suiteId: "replay-sanitized-runtime-export",
            summary: {
              averageScore: 1,
            },
          },
        ],
      },
      null,
      2,
    ),
  );
  writeFileSync(
    runJsonPath,
    JSON.stringify(
      {
        runId: "system-evals-2026-04-09T16-41-50-415Z",
        completedAt: "2026-04-09T16:56:30.883Z",
      },
      null,
      2,
    ),
  );

  const result = acceptSystemBaseline([
    `--history=${historyPath}`,
    `--summary=${summaryPath}`,
    `--run-json=${runJsonPath}`,
    "--id=accepted-live-baseline",
    "--notes=Accepted from workflow artifact.",
    "--run-url=https://github.com/TheOpenSocial/openchat/actions/runs/24201952690",
    "--head-sha=884488cd4c67ee7d89bbd3e9825391e69d62d556",
  ]);

  assert.equal(result.acceptedRun.id, "accepted-live-baseline");
  assert.equal(result.acceptedRun.system.averageScore, 0.924);
  assert.equal(result.acceptedRun.system.gateScore, 0.9559166666666666);
  assert.equal(result.acceptedRun.liveSocialSimulation.meanScore, 0.731);
  assert.equal(
    result.acceptedRun.source.runUrl,
    "https://github.com/TheOpenSocial/openchat/actions/runs/24201952690",
  );

  const updated = JSON.parse(readFileSync(historyPath, "utf8"));
  assert.equal(updated.acceptedRuns.length, 1);
  assert.equal(updated.acceptedRuns[0].suiteScores["social-sim-live-benchmark"], 0.731);
});
