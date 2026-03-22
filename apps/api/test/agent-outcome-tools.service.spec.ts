import { describe, expect, it, vi } from "vitest";
import { AgentOutcomeToolsService } from "../src/agent/agent-outcome-tools.service.js";

describe("AgentOutcomeToolsService", () => {
  it("searches candidates using parsed intent and matching service", async () => {
    const agentService: any = {};
    const intentsService: any = {};
    const discoveryService: any = {};
    const matchingService: any = {
      retrieveCandidates: vi.fn().mockResolvedValue([
        {
          userId: "candidate-1",
          score: 0.88,
          rationale: { semanticFit: 0.8 },
        },
      ]),
    };
    const personalizationService: any = {};
    const scheduledTasksService: any = {};

    const service = new AgentOutcomeToolsService(
      agentService,
      intentsService,
      discoveryService,
      matchingService,
      personalizationService,
      scheduledTasksService,
    );

    const result = await service.searchCandidates({
      userId: "user-1",
      traceId: "trace-1",
      text: "Find people to talk design with tonight",
      parsedIntent: {
        topics: ["design"],
        activities: ["talk"],
        intentType: "conversation",
        modality: "either",
      },
      take: 4,
    });

    expect(matchingService.retrieveCandidates).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        topics: ["design"],
        activities: ["talk"],
      }),
      4,
      expect.objectContaining({
        traceId: "trace-1",
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        count: 1,
        candidates: [
          expect.objectContaining({
            userId: "candidate-1",
            score: 0.88,
          }),
        ],
      }),
    );
  });

  it("writes memory and schedules follow-up tasks through domain services", async () => {
    const agentService: any = {
      createThread: vi.fn(),
      appendWorkflowUpdate: vi.fn(),
    };
    const intentsService: any = {
      createIntentWithOverrides: vi.fn().mockResolvedValue({
        id: "intent-group-1",
        status: "parsed",
      }),
      sendIntentRequest: vi.fn().mockResolvedValue({
        requestId: "request-1",
        status: "pending",
        existing: false,
      }),
    };
    const discoveryService: any = {
      suggestGroups: vi.fn().mockResolvedValue({
        groups: [{ title: "Founders circle", score: 0.82 }],
      }),
    };
    const matchingService: any = {};
    const personalizationService: any = {
      storeInteractionSummary: vi.fn().mockResolvedValue({
        documentId: "doc-1",
        docType: "interaction_summary",
      }),
      recordBehaviorSignal: vi.fn().mockResolvedValue(undefined),
      refreshPreferenceMemoryDocument: vi.fn().mockResolvedValue(undefined),
    };
    const scheduledTasksService: any = {
      createTask: vi.fn().mockResolvedValue({
        id: "task-1",
        nextRunAt: new Date("2026-03-23T21:00:00.000Z"),
        status: "active",
      }),
    };

    const service = new AgentOutcomeToolsService(
      agentService,
      intentsService,
      discoveryService,
      matchingService,
      personalizationService,
      scheduledTasksService,
    );

    const circles = await service.searchCircles({
      userId: "user-1",
      limit: 2,
    });

    const groupPlan = await service.planGroup({
      userId: "user-1",
      threadId: "thread-1",
      traceId: "trace-1",
      text: "Create a small founders group for this week.",
      groupSizeTarget: 4,
    });

    const memory = await service.writeMemory({
      userId: "user-1",
      summary: "User wants to meet more people into design this week.",
      topics: ["design"],
      activities: ["coffee"],
      context: { source: "agent_turn" },
    });

    const task = await service.scheduleFollowup({
      userId: "user-1",
      title: "Design follow-up",
      summary: "Revisit this design social goal.",
      timezone: "America/Argentina/Buenos_Aires",
    });

    const intro = await service.sendIntroRequest({
      intentId: "intent-group-1",
      recipientUserId: "candidate-1",
      traceId: "trace-1",
      threadId: "thread-1",
    });

    expect(circles).toEqual(
      expect.objectContaining({
        count: 1,
      }),
    );
    expect(groupPlan).toEqual(
      expect.objectContaining({
        planned: true,
        intentId: "intent-group-1",
        groupSizeTarget: 4,
      }),
    );
    expect(memory).toEqual(
      expect.objectContaining({
        stored: true,
        documentId: "doc-1",
        topicSignals: 1,
        activitySignals: 1,
      }),
    );
    expect(scheduledTasksService.createTask).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        title: "Design follow-up",
        task: expect.objectContaining({
          taskType: "social_reminder",
        }),
      }),
    );
    expect(task).toEqual(
      expect.objectContaining({
        scheduled: true,
        taskId: "task-1",
        status: "active",
      }),
    );
    expect(intro).toEqual(
      expect.objectContaining({
        sent: true,
        requestId: "request-1",
      }),
    );
  });
});
