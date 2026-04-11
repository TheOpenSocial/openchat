import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";

import { runLiveBroadReplay } from "./run-live-broad-replay.mjs";

test("runLiveBroadReplay combines workflow replay, workflow snapshot replay, and agentic snapshot replay", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "live-broad-replay-"));
  const result = await runLiveBroadReplay(
    [`--artifact-dir=${root}`],
    process.env,
    {
      async runLiveSanitizedWorkflowReplay(argv) {
        const sanitizedPath = argv
          .find((entry) => entry.startsWith("--sanitized-output="))
          .slice("--sanitized-output=".length);
        writeFileSync(
          sanitizedPath,
          `${JSON.stringify({
            conversationId: "wf-1",
            channel: "agent_workflow",
            provider: "workflow",
            toolFamily: "workflow",
            expected: { allowSideEffects: true },
            observed: {
              selectedTool: "send_message",
              toolCalls: ["send_message"],
              behaviors: [],
              outputText: "Workflow handled.",
              latencyMs: 120,
              sideEffects: true,
            },
          })}\n`,
          "utf8",
        );
        return {
          replay: {
            summary: {
              totalCases: 1,
              averageScore: 1,
            },
          },
        };
      },
      async fetchAgenticEvalSnapshot(argv) {
        const outputPath = argv
          .find((entry) => entry.startsWith("--output="))
          .slice("--output=".length);
        writeFileSync(
          outputPath,
          JSON.stringify({
            summary: { status: "watch" },
            traceGrade: { status: "watch" },
            explainability: { summary: "Correctness regressed." },
            scenarios: [
              {
                scenarioId: "eval_planning_bounds_v1",
                title: "Plan bounds",
                dimension: "correctness",
                passed: true,
                details: "Planner respected limits.",
              },
            ],
          }),
        );
        return {
          outputPath,
          scenarioCount: 1,
        };
      },
      async fetchAgentWorkflowsSnapshot(argv) {
        const outputPath = argv
          .find((entry) => entry.startsWith("--output="))
          .slice("--output=".length);
        writeFileSync(
          outputPath,
          JSON.stringify({
            summary: {
              totalRuns: 1,
            },
            runs: [
              {
                workflowRunId: "social:intent:wf-2",
                traceId: "trace-2",
                domain: "social",
                health: "watch",
                failureClass: "matching_or_negotiation",
              },
            ],
          }),
        );
        return {
          outputPath,
          runCount: 1,
        };
      },
      convertAgentWorkflowsSnapshotToReplay(argv) {
        const inputPath = argv
          .find((entry) => entry.startsWith("--input="))
          .slice("--input=".length);
        const outputPath = argv
          .find((entry) => entry.startsWith("--output="))
          .slice("--output=".length);
        const snapshot = JSON.parse(readFileSync(inputPath, "utf8"));
        writeFileSync(
          outputPath,
          `${JSON.stringify({
            conversationId: snapshot.runs[0].workflowRunId,
            channel: "agent_workflow_snapshot",
            provider: "agent-workflows-snapshot",
            toolFamily: "social",
            expected: { requiredBehaviors: ["workflow_health_watch"], allowSideEffects: false },
            observed: {
              selectedTool: "",
              toolCalls: [],
              behaviors: ["workflow_health_watch"],
              outputText: "Workflow run is watch with failure class matching_or_negotiation.",
              latencyMs: 0,
              sideEffects: false,
            },
          })}\n`,
          "utf8",
        );
        return {
          outputPath,
          caseCount: 1,
        };
      },
      convertAgenticSnapshotToReplay(argv) {
        const inputPath = argv
          .find((entry) => entry.startsWith("--input="))
          .slice("--input=".length);
        const outputPath = argv
          .find((entry) => entry.startsWith("--output="))
          .slice("--output=".length);
        const snapshot = JSON.parse(readFileSync(inputPath, "utf8"));
        writeFileSync(
          outputPath,
          `${JSON.stringify({
            conversationId: snapshot.scenarios[0].scenarioId,
            channel: "agentic_eval",
            provider: "agentic-evals-snapshot",
            toolFamily: "correctness",
            expected: { allowSideEffects: false },
            observed: {
              selectedTool: "",
              toolCalls: [],
              behaviors: ["scenario_passed"],
              outputText: "Planner respected limits.",
              latencyMs: 0,
              sideEffects: false,
            },
          })}\n`,
          "utf8",
        );
        return {
          outputPath,
          caseCount: 1,
        };
      },
      async runReplayEvals(argv) {
        const corpusPath = argv
          .find((entry) => entry.startsWith("--corpus="))
          .slice("--corpus=".length);
        const rows = readFileSync(corpusPath, "utf8").trim().split("\n");
        return {
          summary: {
            totalCases: rows.length,
            averageScore: 1,
          },
        };
      },
    },
  );

  assert.equal(result.replay.summary.totalCases, 3);
  assert.ok(result.combinedReplayPath.endsWith("live-broad-replay.jsonl"));
});
