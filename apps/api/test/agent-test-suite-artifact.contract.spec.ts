import { describe, expect, it } from "vitest";
import { agentTestSuiteArtifactSchema } from "@opensocial/types";

describe("Agent test suite artifact contract", () => {
  it("accepts modern artifacts with records and summary", () => {
    const parsed = agentTestSuiteArtifactSchema.parse({
      runId: "agent-suite-2026-03-26T01-22-22-737Z",
      generatedAt: "2026-03-26T01:22:22.737Z",
      layer: "scenario",
      status: "passed",
      cases: [
        {
          id: "scenario-corpus-suite",
          scenarioIds: ["social_direct_match_v1"],
          status: "passed",
          latencyMs: 1042,
          summary: "Canonical backend scenario corpus",
          sideEffects: [],
        },
      ],
      records: [
        {
          runId: "agent-suite-2026-03-26T01-22-22-737Z",
          layer: "scenario",
          checkId: "scenario-corpus-suite",
          summary: "Canonical backend scenario corpus",
          scenarioId: "social_direct_match_v1",
          workflowRunId: "social:intent:intent-1",
          traceId: "trace-1",
          status: "passed",
          latencyMs: 1042,
          failureClass: null,
          sideEffects: ["intent_request_created"],
          metrics: {
            ackWithinSlo: true,
          },
        },
      ],
      summary: {
        caseCounts: {
          total: 1,
          passed: 1,
          failed: 0,
          skipped: 0,
        },
        recordCounts: {
          total: 1,
          passed: 1,
          failed: 0,
          skipped: 0,
        },
        failureClasses: {},
      },
    });

    expect(parsed.records).toHaveLength(1);
    expect(parsed.summary?.recordCounts.total).toBe(1);
  });

  it("remains backward-compatible with legacy artifacts that only include cases", () => {
    const parsed = agentTestSuiteArtifactSchema.parse({
      runId: "agent-suite-legacy",
      generatedAt: "2026-03-26T01:22:22.737Z",
      layer: "workflow",
      status: "passed",
      cases: [
        {
          id: "agent-workflow-foundation",
          scenarioIds: [],
          status: "passed",
          latencyMs: 2034,
          sideEffects: [],
        },
      ],
    });

    expect(parsed.records).toEqual([]);
    expect(parsed.summary).toBeUndefined();
  });

  it("rejects unknown failure classes in records", () => {
    expect(() =>
      agentTestSuiteArtifactSchema.parse({
        runId: "agent-suite-invalid",
        generatedAt: "2026-03-26T01:22:22.737Z",
        layer: "scenario",
        status: "failed",
        cases: [],
        records: [
          {
            runId: "agent-suite-invalid",
            layer: "scenario",
            checkId: "scenario-corpus-suite",
            scenarioId: "social_direct_match_v1",
            status: "failed",
            latencyMs: 1000,
            failureClass: "totally_unknown_failure",
            sideEffects: [],
          },
        ],
      }),
    ).toThrow();
  });

  it("accepts benchmark artifacts with concurrency and dedupe metrics", () => {
    const parsed = agentTestSuiteArtifactSchema.parse({
      runId: "agent-suite-benchmark",
      generatedAt: "2026-03-26T03:22:22.737Z",
      layer: "benchmark",
      status: "passed",
      cases: [
        {
          id: "agentic-benchmark",
          scenarioIds: ["social_direct_match_v1"],
          status: "passed",
          latencyMs: 2200,
          sideEffects: [],
        },
      ],
      records: [
        {
          runId: "agent-suite-benchmark",
          layer: "benchmark",
          checkId: "agentic-benchmark",
          scenarioId: "social_direct_match_v1",
          workflowRunId: "social:intent:intent-2",
          traceId: null,
          status: "passed",
          latencyMs: 610,
          failureClass: null,
          sideEffects: [
            "ack_within_slo",
            "background_followup_detected",
            "duplicate_visible_side_effects_none",
            "queue_lag_within_budget",
          ],
          metrics: {
            ackWithinSlo: true,
            backgroundFollowupDetected: true,
            queueLagMs: 240,
            duplicateVisibleSideEffects: 0,
            duplicateVisibleSideEffectRate: 0,
            workerIndex: 1,
            burstIndex: 2,
            concurrency: 3,
            burstSize: 5,
          },
        },
      ],
      summary: {
        caseCounts: {
          total: 1,
          passed: 1,
          failed: 0,
          skipped: 0,
        },
        recordCounts: {
          total: 1,
          passed: 1,
          failed: 0,
          skipped: 0,
        },
        failureClasses: {},
        benchmark: {
          runCount: 1,
          concurrency: 3,
          burstSize: 5,
          duplicateVisibleSideEffectRate: 0,
          queueLagP95Ms: 240,
        },
      },
    });

    expect(parsed.layer).toBe("benchmark");
    expect(parsed.summary?.benchmark?.concurrency).toBe(3);
    expect(parsed.records[0]?.metrics?.duplicateVisibleSideEffectRate).toBe(0);
  });
});
