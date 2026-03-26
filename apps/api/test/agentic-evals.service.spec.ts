import { describe, expect, it, vi } from "vitest";
import { AgenticEvalsService } from "../src/admin/agentic-evals.service.js";

describe("AgenticEvalsService", () => {
  it("includes social outcome telemetry in the eval snapshot", async () => {
    const analyticsService: any = {
      getAgentOutcomeMetrics: vi.fn().mockResolvedValue({
        window: {
          days: 14,
          start: "2026-03-08T00:00:00.000Z",
          end: "2026-03-22T00:00:00.000Z",
          followupEngagementHours: 24,
        },
        summary: {
          totalActions: 6,
          executedActions: 5,
          deniedActions: 0,
          failedActions: 1,
        },
        toolAttempts: [
          {
            tool: "intro.send_request",
            attempted: 2,
            executed: 2,
            denied: 0,
            failed: 0,
          },
          {
            tool: "circle.join",
            attempted: 2,
            executed: 1,
            denied: 0,
            failed: 1,
          },
          {
            tool: "followup.schedule",
            attempted: 2,
            executed: 2,
            denied: 0,
            failed: 0,
          },
        ],
        introRequestAcceptance: {
          attempted: 2,
          accepted: 1,
          pending: 1,
          rejected: 0,
          cancelled: 0,
          expired: 0,
          settled: 1,
          acceptanceRate: 0.5,
          settledRate: 0.5,
        },
        circleJoinConversion: {
          attempted: 2,
          executed: 1,
          converted: 1,
          failed: 1,
          conversionRate: 0.5,
        },
        followupUsefulness: {
          scheduled: 2,
          completedRuns: 2,
          skippedRuns: 0,
          failedRuns: 0,
          engagedRuns: 1,
          completionRate: 1,
          usefulnessRate: 0.5,
          engagementWindowHours: 24,
        },
      }),
    };
    const workflowRuntimeService: any = {
      listRecentRuns: vi.fn().mockResolvedValue([
        {
          workflowRunId: "social:intent:intent-1",
          traceId: "trace-1",
          stages: [{ stage: "parse", status: "completed" }],
          replayability: "replayable",
        },
        {
          workflowRunId: "social:intent:intent-2",
          traceId: "trace-2",
          stages: [{ stage: "parse", status: "completed" }],
          replayability: "partial",
        },
      ]),
    };

    const service = new AgenticEvalsService(
      analyticsService,
      workflowRuntimeService,
    );
    (service as any).evalOpenAI = {
      planConversationTurn: vi.fn().mockImplementation(async (input: any) => {
        if (
          String(input?.userMessage ?? "")
            .toLowerCase()
            .includes("road bike")
        ) {
          return {
            specialists: ["intent_parser", "manager"],
            toolCalls: [
              {
                role: "manager",
                tool: "negotiation.evaluate",
                input: {
                  domain: "commerce",
                  mode: "async",
                },
              },
            ],
          };
        }
        return {
          specialists: ["intent_parser"],
          toolCalls: [],
        };
      }),
      composeConversationResponse: vi
        .fn()
        .mockResolvedValue(
          "I’ll keep searching in the background and send a quick update here. If you want, I can widen filters for timing or group size.",
        ),
      assistModeration: vi.fn().mockResolvedValue({ decision: "blocked" }),
      parseIntent: vi.fn().mockResolvedValue({
        version: 1,
        rawText: "test",
        intentType: "chat",
        urgency: "soon",
        topics: [],
        activities: [],
        timingConstraints: [],
        skillConstraints: [],
        vibeConstraints: [],
        confidence: 0.5,
        requiresFollowUp: false,
      }),
      listCapturedFailures: vi.fn().mockReturnValue([{}]),
    };
    const snapshot = await service.runSnapshot();

    expect(
      snapshot.scenarios.some(
        (scenario) =>
          scenario.id === "social_outcome_telemetry" && scenario.passed,
      ),
    ).toBe(true);
    expect(snapshot.scenarios.map((scenario) => scenario.scenarioId)).toEqual(
      expect.arrayContaining([
        "eval_planning_bounds_v1",
        "eval_injection_fallback_v1",
        "eval_moderation_fallback_v1",
        "eval_human_approval_policy_v1",
        "eval_failure_capture_v1",
        "eval_social_outcome_telemetry_v1",
        "eval_negotiation_quality_v1",
        "eval_workflow_runtime_traceability_v1",
        "eval_tone_agentic_async_ack_v1",
        "eval_usefulness_no_match_recovery_v1",
        "eval_grounding_profile_memory_consistency_v1",
      ]),
    );
    expect(snapshot.scorecard).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ dimension: "safety", total: 2 }),
        expect.objectContaining({ dimension: "observability", total: 1 }),
        expect.objectContaining({ dimension: "negotiation", total: 1 }),
        expect.objectContaining({ dimension: "tone", total: 1 }),
        expect.objectContaining({ dimension: "usefulness", total: 1 }),
        expect.objectContaining({ dimension: "grounding", total: 1 }),
      ]),
    );
    expect(snapshot.traceGrade).toEqual(
      expect.objectContaining({
        grade: expect.any(String),
        status: expect.any(String),
        score: expect.any(Number),
      }),
    );
    expect(snapshot.summary).toEqual(
      expect.objectContaining({
        status: "healthy",
        regressionCount: 0,
      }),
    );
    expect(Array.isArray(snapshot.regressions)).toBe(true);
    expect(snapshot.regressions).toHaveLength(0);
    expect(analyticsService.getAgentOutcomeMetrics).toHaveBeenCalledWith({
      days: 14,
      followupEngagementHours: 24,
    });
    expect(workflowRuntimeService.listRecentRuns).toHaveBeenCalledWith(25);
  });

  it("fails workflow traceability eval when trace coverage drops below threshold", async () => {
    const analyticsService: any = {
      getAgentOutcomeMetrics: vi.fn().mockResolvedValue({
        summary: { totalActions: 3 },
        toolAttempts: [
          { tool: "intro.send_request" },
          { tool: "circle.join" },
          { tool: "followup.schedule" },
        ],
        introRequestAcceptance: { acceptanceRate: 0.5 },
        circleJoinConversion: { conversionRate: 0.5 },
        followupUsefulness: { usefulnessRate: 0.5 },
      }),
    };
    const workflowRuntimeService: any = {
      listRecentRuns: vi.fn().mockResolvedValue([
        {
          workflowRunId: "social:intent:intent-1",
          traceId: null,
          stages: [],
          replayability: "inspect_only",
        },
        {
          workflowRunId: "social:intent:intent-2",
          traceId: "trace-2",
          stages: [{ stage: "parse", status: "completed" }],
          replayability: "partial",
        },
      ]),
    };
    const service = new AgenticEvalsService(
      analyticsService,
      workflowRuntimeService,
    );
    (service as any).evalOpenAI = {
      planConversationTurn: vi.fn().mockImplementation(async (input: any) => {
        if (
          String(input?.userMessage ?? "")
            .toLowerCase()
            .includes("road bike")
        ) {
          return {
            specialists: ["intent_parser", "manager"],
            toolCalls: [
              {
                role: "manager",
                tool: "negotiation.evaluate",
                input: {
                  domain: "commerce",
                  mode: "async",
                },
              },
            ],
          };
        }
        return {
          specialists: ["intent_parser"],
          toolCalls: [],
        };
      }),
      composeConversationResponse: vi
        .fn()
        .mockResolvedValue(
          "I’ll continue searching and keep you posted. We can widen filters or adjust timing if needed.",
        ),
      assistModeration: vi.fn().mockResolvedValue({ decision: "blocked" }),
      parseIntent: vi.fn().mockResolvedValue({
        version: 1,
        rawText: "test",
        intentType: "chat",
        urgency: "soon",
        topics: [],
        activities: [],
        timingConstraints: [],
        skillConstraints: [],
        vibeConstraints: [],
        confidence: 0.5,
        requiresFollowUp: false,
      }),
      listCapturedFailures: vi.fn().mockReturnValue([{}]),
    };

    const snapshot = await service.runSnapshot();
    const runtimeScenario = snapshot.scenarios.find(
      (scenario) => scenario.id === "workflow_runtime_traceability",
    );

    expect(runtimeScenario?.passed).toBe(false);
    expect(runtimeScenario?.details).toContain("fell below thresholds");
    expect(snapshot.summary).toEqual(
      expect.objectContaining({
        status: "watch",
      }),
    );
    expect(snapshot.regressions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "dimension_correctness_degraded",
          severity: "warning",
        }),
      ]),
    );
  });
});
