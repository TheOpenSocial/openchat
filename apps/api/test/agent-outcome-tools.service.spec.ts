import { describe, expect, it, vi } from "vitest";
import { AgentOutcomeToolsService } from "../src/agent/agent-outcome-tools.service.js";

describe("AgentOutcomeToolsService", () => {
  it("searches candidates using parsed intent and matching service", async () => {
    const agentService: any = {};
    const intentsService: any = {};
    const discoveryService: any = {};
    const inboxService: any = {};
    const matchingService: any = {
      lookupAvailabilityContext: vi.fn().mockResolvedValue({
        requester: {
          userId: "user-1",
          availabilityMode: "now",
          reachable: "always",
          modality: "either",
          currentlyAvailable: true,
          contactAllowed: true,
          overlapMinutesWithRequester: 0,
        },
        candidates: [],
        generatedAt: new Date("2026-03-22T00:00:00.000Z").toISOString(),
      }),
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
      inboxService,
      matchingService,
      personalizationService,
      undefined,
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
      widenOnScarcity: true,
      scarcityThreshold: 2,
    });
    const availability = await service.lookupAvailability({
      userId: "user-1",
      candidateUserIds: ["candidate-1"],
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
        scarcity: expect.objectContaining({
          detected: true,
          widened: true,
          widenedCandidateCount: 1,
        }),
        candidates: [
          expect.objectContaining({
            userId: "candidate-1",
            score: 0.88,
          }),
        ],
      }),
    );
    expect(matchingService.retrieveCandidates).toHaveBeenCalledTimes(2);
    expect(matchingService.lookupAvailabilityContext).toHaveBeenCalledWith(
      "user-1",
      ["candidate-1"],
    );
    expect(availability).toEqual(
      expect.objectContaining({
        requester: expect.objectContaining({
          userId: "user-1",
          currentlyAvailable: true,
        }),
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
    const inboxService: any = {
      updateStatus: vi.fn().mockResolvedValue({
        request: {
          id: "request-1",
          status: "accepted",
          senderUserId: "user-3",
          recipientUserId: "user-1",
          intentId: "intent-group-1",
        },
        queued: true,
      }),
      cancelByOriginator: vi.fn().mockResolvedValue({
        request: {
          id: "request-2",
          status: "cancelled",
          senderUserId: "user-1",
          recipientUserId: "user-4",
          intentId: "intent-group-1",
        },
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
    const recurringCirclesService: any = {
      createCircle: vi.fn().mockResolvedValue({
        id: "circle-1",
        title: "Design circle",
        nextSessionAt: new Date("2026-03-29T21:00:00.000Z"),
      }),
      addMember: vi.fn().mockResolvedValue({
        circleId: "circle-1",
        userId: "user-2",
        status: "active",
        role: "member",
      }),
    };

    const service = new AgentOutcomeToolsService(
      agentService,
      intentsService,
      discoveryService,
      inboxService,
      matchingService,
      personalizationService,
      recurringCirclesService,
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
    const accepted = await service.acceptIntro({
      requestId: "request-1",
      actorUserId: "user-1",
    });
    const retracted = await service.retractIntro({
      requestId: "request-2",
      actorUserId: "user-1",
    });
    const circle = await service.createCircle({
      userId: "user-1",
      title: "Design circle",
      topicTags: ["design", "founders"],
    });
    const joined = await service.joinCircle({
      circleId: "circle-1",
      ownerUserId: "owner-1",
      userId: "user-2",
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
    expect(accepted).toEqual(
      expect.objectContaining({
        accepted: true,
        requestId: "request-1",
      }),
    );
    expect(retracted).toEqual(
      expect.objectContaining({
        retracted: true,
        requestId: "request-2",
      }),
    );
    expect(circle).toEqual(
      expect.objectContaining({
        created: true,
        circleId: "circle-1",
      }),
    );
    expect(joined).toEqual(
      expect.objectContaining({
        joined: true,
        circleId: "circle-1",
        userId: "user-2",
      }),
    );
    expect(personalizationService.storeInteractionSummary).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        summary: expect.stringContaining("Accepted a social intro request"),
        safe: true,
        context: expect.objectContaining({
          outcome: "intro_accepted",
          requestId: "request-1",
        }),
      }),
    );
    expect(personalizationService.storeInteractionSummary).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        summary: expect.stringContaining(
          'Created a recurring circle "Design circle"',
        ),
        safe: true,
        context: expect.objectContaining({
          outcome: "circle_created",
          circleId: "circle-1",
        }),
      }),
    );
    expect(personalizationService.storeInteractionSummary).toHaveBeenCalledWith(
      "user-2",
      expect.objectContaining({
        summary: expect.stringContaining("Joined a recurring circle"),
        safe: true,
        context: expect.objectContaining({
          outcome: "circle_joined",
          circleId: "circle-1",
        }),
      }),
    );
    expect(personalizationService.recordBehaviorSignal).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        edgeType: "high_success_with",
        targetNode: {
          nodeType: "person",
          label: "user:user-3",
        },
        feedbackType: "agent_outcome_high_success_person",
      }),
    );
  });
});
