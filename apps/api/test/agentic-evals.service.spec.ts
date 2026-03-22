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

    const service = new AgenticEvalsService(analyticsService);
    (service as any).evalOpenAI = {
      planConversationTurn: vi.fn().mockResolvedValue({
        specialists: ["intent_parser"],
        toolCalls: [],
      }),
      composeConversationResponse: vi.fn().mockResolvedValue("Safe fallback."),
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
    expect(analyticsService.getAgentOutcomeMetrics).toHaveBeenCalledWith({
      days: 14,
      followupEngagementHours: 24,
    });
  });
});
