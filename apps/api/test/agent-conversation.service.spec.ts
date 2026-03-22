import { describe, expect, it, vi } from "vitest";
import { AgentConversationService } from "../src/agent/agent-conversation.service.js";

const IDS = {
  threadId: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
};

function createServiceHarness() {
  const prisma: any = {
    agentMessage: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: "msg-1",
          threadId: IDS.threadId,
          role: "user",
          content: "previous user message",
          createdByUserId: IDS.userId,
          createdAt: new Date("2026-03-20T10:00:00.000Z"),
        },
      ]),
    },
    agentThread: {
      findUnique: vi.fn().mockResolvedValue({
        title: "Main",
        createdAt: new Date("2026-03-20T09:30:00.000Z"),
      }),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue({
        displayName: "Alex Rivera",
      }),
    },
    userProfile: {
      findUnique: vi.fn().mockResolvedValue({
        bio: "Designer who likes fast plans.",
        city: "Buenos Aires",
        country: "AR",
        onboardingState: "complete",
        availabilityMode: "flexible",
      }),
    },
    userInterest: {
      findMany: vi.fn().mockResolvedValue([
        { label: "Design", kind: "topic" },
        { label: "AI", kind: "topic" },
        { label: "Meet people", kind: "goal" },
      ]),
    },
    userPreference: {
      findMany: vi.fn().mockResolvedValue([
        { key: "global_rules_intent_mode", value: "balanced" },
        { key: "global_rules_modality", value: "either" },
        { key: "global_rules_reachable", value: "always" },
        { key: "global_rules_notification_mode", value: "immediate" },
        { key: "global_rules_memory_mode", value: "standard" },
        {
          key: "global_rules_timezone",
          value: "America/Argentina/Buenos_Aires",
        },
      ]),
    },
    retrievalDocument: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: "doc-1",
          userId: IDS.userId,
          docType: "preference",
          content: "prefers evening sessions",
          createdAt: new Date("2026-03-20T09:00:00.000Z"),
        },
      ]),
    },
    moderationFlag: {
      create: vi.fn().mockResolvedValue({ id: "mod-flag-1" }),
    },
    agentPlanCheckpoint: {
      create: vi.fn().mockResolvedValue({
        id: "checkpoint-1",
        status: "pending",
      }),
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn(),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({ id: "audit-log-1" }),
    },
  };

  const agentService: any = {
    createUserMessage: vi.fn().mockResolvedValue({
      id: "user-msg-1",
      threadId: IDS.threadId,
      role: "user",
      content: "Need a tennis partner tonight",
      createdByUserId: IDS.userId,
      createdAt: new Date("2026-03-20T11:00:00.000Z"),
    }),
    appendWorkflowUpdate: vi.fn().mockResolvedValue({
      id: "workflow-msg-1",
      threadId: IDS.threadId,
      role: "workflow",
      content: "update",
      createdByUserId: null,
      createdAt: new Date("2026-03-20T11:00:01.000Z"),
    }),
    appendEphemeralWorkflowUpdate: vi.fn().mockReturnValue({
      id: "workflow-ephemeral-1",
      threadId: IDS.threadId,
      role: "workflow",
      content: "ephemeral update",
      createdByUserId: null,
      createdAt: new Date("2026-03-20T11:00:01.000Z"),
    }),
    createAgentMessage: vi.fn().mockResolvedValue({
      id: "agent-msg-1",
      threadId: IDS.threadId,
      role: "agent",
      content: "response",
      createdByUserId: null,
      createdAt: new Date("2026-03-20T11:00:02.000Z"),
    }),
  };

  const moderationService: any = {
    assessContentRisk: vi.fn().mockReturnValue({
      decision: "clean",
      score: 0,
      reasons: ["test_clean"],
      surface: "agent_turn",
      signals: {
        urlCount: 0,
        mentionCount: 0,
        repeatedWordRatio: 0,
        repeatedCharacterRun: false,
      },
    }),
  };

  const appCacheService: any = {
    getJson: vi.fn().mockResolvedValue(null),
    setJson: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  };

  const agentOutcomeToolsService: any = {
    lookupAvailability: vi.fn().mockResolvedValue({
      requester: {
        userId: IDS.userId,
        availabilityMode: "flexible",
        reachable: "always",
        modality: "either",
        currentlyAvailable: true,
        contactAllowed: true,
        overlapMinutesWithRequester: 0,
      },
      candidates: [],
      generatedAt: new Date("2026-03-20T11:00:00.000Z").toISOString(),
    }),
    searchCandidates: vi.fn().mockResolvedValue({
      count: 1,
      candidates: [{ userId: "candidate-1", score: 0.91 }],
    }),
    searchCircles: vi.fn().mockResolvedValue({
      count: 1,
      groups: [{ title: "Design circle", score: 0.74 }],
    }),
    planGroup: vi.fn().mockResolvedValue({
      planned: true,
      intentId: "intent-group-1",
      status: "parsed",
      groupSizeTarget: 3,
    }),
    persistIntent: vi.fn().mockResolvedValue({
      persisted: true,
      intentId: "intent-1",
      status: "parsed",
    }),
    sendIntroRequest: vi.fn().mockResolvedValue({
      sent: true,
      requestId: "request-1",
      status: "pending",
    }),
    acceptIntro: vi.fn().mockResolvedValue({
      accepted: true,
      requestId: "request-1",
      status: "accepted",
      queued: true,
    }),
    rejectIntro: vi.fn().mockResolvedValue({
      rejected: true,
      requestId: "request-2",
      status: "rejected",
    }),
    retractIntro: vi.fn().mockResolvedValue({
      retracted: true,
      requestId: "request-3",
      status: "cancelled",
    }),
    createCircle: vi.fn().mockResolvedValue({
      created: true,
      circleId: "circle-1",
      title: "Founders circle",
      nextSessionAt: new Date("2026-03-23T21:00:00.000Z").toISOString(),
    }),
    joinCircle: vi.fn().mockResolvedValue({
      joined: true,
      circleId: "circle-1",
      userId: IDS.userId,
      status: "active",
      role: "member",
    }),
    startConversation: vi.fn().mockResolvedValue({
      threadId: "thread-2",
      title: "Tennis tonight",
      createdAt: new Date("2026-03-20T11:05:00.000Z").toISOString(),
    }),
    writeMemory: vi.fn().mockResolvedValue({
      stored: true,
      documentId: "doc-2",
      docType: "interaction_summary",
    }),
    scheduleFollowup: vi.fn().mockResolvedValue({
      scheduled: true,
      taskId: "task-1",
      nextRunAt: new Date("2026-03-21T18:00:00.000Z").toISOString(),
      status: "active",
    }),
  };

  const service = new AgentConversationService(
    prisma,
    agentService,
    appCacheService,
    moderationService,
    agentOutcomeToolsService,
  );

  const openai = {
    planConversationTurn: vi.fn().mockResolvedValue({
      specialists: ["intent_parser"],
      toolCalls: [],
      responseGoal: "help the user",
    }),
    composeConversationResponse: vi.fn().mockResolvedValue("Default response"),
    parseIntent: vi.fn().mockResolvedValue({
      version: 1,
      rawText: "Need a tennis partner tonight",
      intentType: "activity",
      urgency: "soon",
      topics: ["tennis"],
      activities: ["play"],
      timingConstraints: ["tonight"],
      skillConstraints: [],
      vibeConstraints: [],
      confidence: 0.72,
      requiresFollowUp: false,
    }),
    assistModeration: vi.fn().mockResolvedValue({ decision: "clean" }),
    composeNotificationCopy: vi
      .fn()
      .mockResolvedValue("New update available for your request."),
    explainRanking: vi.fn().mockResolvedValue({
      candidateUserId: IDS.userId,
      score: 0.62,
      blockedByPolicy: false,
      reasons: ["semanticFit: 0.74"],
    }),
  };

  (service as any).openai = openai;

  return {
    service,
    prisma,
    agentService,
    openai,
    moderationService,
    appCacheService,
    agentOutcomeToolsService,
  };
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("AgentConversationService", () => {
  it("runs a full turn and enforces runtime handoff/tool policy", async () => {
    const { service, agentService, openai } = createServiceHarness();

    openai.planConversationTurn.mockResolvedValueOnce({
      specialists: ["intent_parser", "manager", "notification_copy"],
      toolCalls: [
        {
          role: "intent_parser",
          tool: "intent.parse",
          input: { text: "Need a tennis partner tonight" },
        },
        {
          role: "intent_parser",
          tool: "workflow.write",
          input: { content: "not allowed" },
        },
        {
          role: "manager",
          tool: "workflow.write",
          input: { content: "manager workflow note" },
        },
        {
          role: "ranking_explanation",
          tool: "ranking.explain",
          input: {
            candidateUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            score: 0.55,
            features: {
              semanticFit: 0.71,
            },
          },
        },
      ],
      responseGoal: "confirm intent and ask for one missing constraint",
    });
    openai.composeConversationResponse.mockResolvedValueOnce(
      "I can help with that. Do you prefer 1:1 or group?",
    );

    const result = await service.runAgenticTurn({
      threadId: IDS.threadId,
      userId: IDS.userId,
      content: "Need a tennis partner tonight",
      traceId: "trace-agentic-1",
    });

    expect(result.plan.specialists).toEqual([
      "intent_parser",
      "notification_copy",
    ]);
    expect(result.toolResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: "intent_parser",
          tool: "workflow.write",
          status: "denied",
          reason: "tool_not_allowed_for_role",
        }),
        expect.objectContaining({
          role: "manager",
          tool: "workflow.write",
          status: "executed",
        }),
        expect.objectContaining({
          role: "ranking_explanation",
          tool: "ranking.explain",
          status: "denied",
          reason: "tool_role_not_handed_off",
        }),
      ]),
    );
    expect(agentService.appendWorkflowUpdate).toHaveBeenCalledWith(
      IDS.threadId,
      "manager workflow note",
      expect.objectContaining({ traceId: "trace-agentic-1" }),
    );
    expect(agentService.createAgentMessage).toHaveBeenCalledWith(
      IDS.threadId,
      "I can help with that. Do you prefer 1:1 or group?",
    );
  });

  it("continues the turn when a specialist fails", async () => {
    const { service, agentService, openai } = createServiceHarness();

    openai.planConversationTurn.mockResolvedValueOnce({
      specialists: ["intent_parser"],
      toolCalls: [],
      responseGoal: "provide a safe fallback answer",
    });
    openai.parseIntent.mockRejectedValueOnce(
      new Error("temporary parser outage"),
    );
    openai.composeConversationResponse.mockResolvedValueOnce(
      "I can still help. Share time, mode, and group size preference.",
    );

    const result = await service.runAgenticTurn({
      threadId: IDS.threadId,
      userId: IDS.userId,
      content: "Need help now",
      traceId: "trace-agentic-2",
    });

    expect(result.specialistNotes).toEqual([
      {
        role: "intent_parser",
        status: "failed",
      },
    ]);
    expect(agentService.createAgentMessage).toHaveBeenCalledWith(
      IDS.threadId,
      "I can still help. Share time, mode, and group size preference.",
    );
  });

  it("records social tool actions in workflow and audit surfaces", async () => {
    const { service, agentService, openai, prisma } = createServiceHarness();

    openai.planConversationTurn.mockResolvedValueOnce({
      specialists: ["intent_parser"],
      toolCalls: [
        {
          role: "manager",
          tool: "intent.persist",
          input: {
            text: "Find someone to talk design with tonight",
          },
        },
        {
          role: "manager",
          tool: "followup.schedule",
          input: {
            title: "Design follow-up",
            summary: "Retry this design social goal tomorrow.",
          },
        },
      ],
      responseGoal: "move toward a concrete social next step",
    });
    openai.composeConversationResponse.mockResolvedValueOnce(
      "I saved that goal and set a follow-up so we keep momentum.",
    );

    await service.runAgenticTurn({
      threadId: IDS.threadId,
      userId: IDS.userId,
      content: "Find someone to talk design with tonight",
      traceId: "trace-agentic-audit",
    });

    expect(agentService.appendWorkflowUpdate).toHaveBeenCalledWith(
      IDS.threadId,
      "Saved a social intent for follow-through (intent-1).",
      expect.objectContaining({
        category: "agent_tool_action",
        traceId: "trace-agentic-audit",
        tool: "intent.persist",
      }),
    );
    expect(agentService.appendWorkflowUpdate).toHaveBeenCalledWith(
      IDS.threadId,
      "Scheduled a follow-up task (task-1).",
      expect.objectContaining({
        category: "agent_tool_action",
        traceId: "trace-agentic-audit",
        tool: "followup.schedule",
      }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "agent.tool_action_executed",
          entityType: "agent_thread",
          entityId: IDS.threadId,
          metadata: expect.objectContaining({
            traceId: "trace-agentic-audit",
            tool: "intent.persist",
            status: "executed",
            summary: "Saved a social intent for follow-through (intent-1).",
          }),
        }),
      }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "agent.tool_action_executed",
          entityType: "agent_thread",
          entityId: IDS.threadId,
          metadata: expect.objectContaining({
            traceId: "trace-agentic-audit",
            tool: "followup.schedule",
            status: "executed",
            summary: "Scheduled a follow-up task (task-1).",
          }),
        }),
      }),
    );
  });

  it("executes availability lookup before time-sensitive social search", async () => {
    const { service, openai, agentOutcomeToolsService } =
      createServiceHarness();

    openai.planConversationTurn.mockResolvedValueOnce({
      specialists: ["intent_parser"],
      toolCalls: [
        {
          role: "manager",
          tool: "availability.lookup",
          input: {
            candidateUserIds: ["candidate-1"],
          },
        },
        {
          role: "manager",
          tool: "candidate.search",
          input: {
            text: "Find someone active tonight to talk design with",
            take: 4,
            widenOnScarcity: true,
            scarcityThreshold: 2,
          },
        },
      ],
      responseGoal: "prioritize people who can actually connect tonight",
    });
    openai.composeConversationResponse.mockResolvedValueOnce(
      "I checked who is reachable now and started looking for strong design matches tonight.",
    );

    await service.runAgenticTurn({
      threadId: IDS.threadId,
      userId: IDS.userId,
      content: "Find someone active tonight to talk design with",
      traceId: "trace-agentic-availability",
    });

    expect(agentOutcomeToolsService.lookupAvailability).toHaveBeenCalledWith({
      userId: IDS.userId,
      candidateUserIds: ["candidate-1"],
    });
    expect(agentOutcomeToolsService.searchCandidates).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: IDS.userId,
        text: "Find someone active tonight to talk design with",
        take: 4,
        widenOnScarcity: true,
        scarcityThreshold: 2,
      }),
    );
  });

  it("runs independent tools and specialists in parallel", async () => {
    const { service, openai } = createServiceHarness();
    const toolOne = createDeferred<{
      version: number;
      rawText: string;
      intentType: string;
      urgency: string;
      topics: string[];
      activities: string[];
      timingConstraints: string[];
      skillConstraints: string[];
      vibeConstraints: string[];
      confidence: number;
      requiresFollowUp: boolean;
    }>();
    const toolTwo = createDeferred<{
      candidateUserId: string;
      score: number;
      blockedByPolicy: boolean;
      reasons: string[];
    }>();

    openai.planConversationTurn.mockResolvedValueOnce({
      specialists: ["intent_parser", "ranking_explanation"],
      toolCalls: [
        {
          role: "intent_parser",
          tool: "intent.parse",
          input: { text: "Need a tennis partner tonight" },
        },
        {
          role: "ranking_explanation",
          tool: "ranking.explain",
          input: {
            candidateUserId: IDS.userId,
            score: 0.55,
            features: { semanticFit: 0.71 },
          },
        },
      ],
      responseGoal: "respond after concurrent work",
    });

    let toolCallsInFlight = 0;
    let maxToolCallsInFlight = 0;
    openai.parseIntent.mockImplementationOnce(async () => {
      toolCallsInFlight += 1;
      maxToolCallsInFlight = Math.max(maxToolCallsInFlight, toolCallsInFlight);
      try {
        return await toolOne.promise;
      } finally {
        toolCallsInFlight -= 1;
      }
    });
    openai.explainRanking.mockImplementationOnce(async () => {
      toolCallsInFlight += 1;
      maxToolCallsInFlight = Math.max(maxToolCallsInFlight, toolCallsInFlight);
      try {
        return await toolTwo.promise;
      } finally {
        toolCallsInFlight -= 1;
      }
    });
    openai.composeConversationResponse.mockResolvedValueOnce(
      "Parallel work finished.",
    );

    const runPromise = service.runAgenticTurn({
      threadId: IDS.threadId,
      userId: IDS.userId,
      content: "Need a tennis partner tonight",
      traceId: "trace-agentic-parallel",
    });

    await vi.waitFor(() => {
      expect(maxToolCallsInFlight).toBe(2);
    });

    toolOne.resolve({
      version: 1,
      rawText: "Need a tennis partner tonight",
      intentType: "activity",
      urgency: "soon",
      topics: ["tennis"],
      activities: ["play"],
      timingConstraints: ["tonight"],
      skillConstraints: [],
      vibeConstraints: [],
      confidence: 0.72,
      requiresFollowUp: false,
    });
    toolTwo.resolve({
      candidateUserId: IDS.userId,
      score: 0.62,
      blockedByPolicy: false,
      reasons: ["semanticFit: 0.74"],
    });

    const result = await runPromise;
    expect(result.toolResults).toEqual([
      expect.objectContaining({
        role: "intent_parser",
        tool: "intent.parse",
        status: "executed",
      }),
      expect.objectContaining({
        role: "ranking_explanation",
        tool: "ranking.explain",
        status: "executed",
      }),
    ]);
  });

  it("blocks risky tool actions that require human approval", async () => {
    const { service, openai, prisma, agentService } = createServiceHarness();

    openai.planConversationTurn.mockResolvedValueOnce({
      specialists: ["intent_parser"],
      toolCalls: [
        {
          role: "manager",
          tool: "workflow.write",
          input: {
            content: "Cancel this intent now.",
            actionType: "cancel_intent_flow",
            riskLevel: "medium",
          },
        },
      ],
      responseGoal: "handle cancel request safely",
    });
    openai.composeConversationResponse.mockResolvedValueOnce(
      "I need human approval before canceling this flow.",
    );

    const result = await service.runAgenticTurn({
      threadId: IDS.threadId,
      userId: IDS.userId,
      content: "Cancel this request now",
      traceId: "trace-agentic-3",
    });

    expect(result.toolResults).toEqual([
      expect.objectContaining({
        role: "manager",
        tool: "workflow.write",
        status: "denied",
        reason: "human_approval_required",
        output: expect.objectContaining({
          checkpointId: "checkpoint-1",
          status: "pending",
        }),
      }),
    ]);
    expect(prisma.agentPlanCheckpoint.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          threadId: IDS.threadId,
          userId: IDS.userId,
          actionType: "cancel_intent_flow",
          riskLevel: "medium",
          status: "pending",
        }),
      }),
    );
    expect(agentService.appendWorkflowUpdate).toHaveBeenCalledWith(
      IDS.threadId,
      expect.stringContaining("Approval needed"),
      expect.objectContaining({
        category: "plan_checkpoint",
        checkpointId: "checkpoint-1",
      }),
    );
  });

  it("lists and resolves plan checkpoints", async () => {
    const { service, prisma, agentService } = createServiceHarness();
    prisma.agentPlanCheckpoint.findMany.mockResolvedValueOnce([
      {
        id: "checkpoint-1",
        threadId: IDS.threadId,
        userId: IDS.userId,
        traceId: "trace-1",
        requestedByRole: "manager",
        tool: "workflow.write",
        actionType: "cancel_intent_flow",
        riskLevel: "medium",
        status: "pending",
        requestMetadata: {},
        decisionReason: null,
        resolvedByUserId: null,
        resolvedAt: null,
        createdAt: new Date("2026-03-20T11:00:00.000Z"),
        updatedAt: new Date("2026-03-20T11:00:00.000Z"),
      },
    ]);
    prisma.agentPlanCheckpoint.findFirst.mockResolvedValueOnce({
      id: "checkpoint-1",
      threadId: IDS.threadId,
      userId: IDS.userId,
      traceId: "trace-1",
      requestedByRole: "manager",
      tool: "workflow.write",
      actionType: "cancel_intent_flow",
      riskLevel: "medium",
      status: "pending",
    });
    prisma.agentPlanCheckpoint.update.mockResolvedValueOnce({
      id: "checkpoint-1",
      status: "approved",
    });

    const checkpoints = await service.listPlanCheckpoints({
      threadId: IDS.threadId,
      status: "pending",
      limit: 10,
    });
    expect(checkpoints).toHaveLength(1);
    expect(prisma.agentPlanCheckpoint.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          threadId: IDS.threadId,
          status: "pending",
        }),
      }),
    );

    const resolved = await service.resolvePlanCheckpoint({
      threadId: IDS.threadId,
      checkpointId: "checkpoint-1",
      actorUserId: IDS.userId,
      decision: "approved",
      reason: "safe to proceed",
    });
    expect(resolved).toEqual({ id: "checkpoint-1", status: "approved" });
    expect(agentService.appendWorkflowUpdate).toHaveBeenCalledWith(
      IDS.threadId,
      expect.stringContaining("Plan checkpoint approved"),
      expect.objectContaining({
        category: "plan_checkpoint_decision",
        checkpointId: "checkpoint-1",
        decision: "approved",
      }),
    );
  });

  it("chunks assistant text into response_token workflow updates when streaming is enabled", async () => {
    const { service, agentService, openai } = createServiceHarness();

    openai.planConversationTurn.mockResolvedValueOnce({
      specialists: [],
      toolCalls: [],
      responseGoal: "return streamed chunks",
    });
    openai.composeConversationResponse.mockResolvedValueOnce(
      [
        "This is a streamed response payload designed to be chunked into",
        "multiple workflow token updates so SSE clients can render progress",
        "before the final assistant message is persisted.",
      ].join(" "),
    );

    const result = await service.runAgenticTurn({
      threadId: IDS.threadId,
      userId: IDS.userId,
      content: "Stream this",
      traceId: "trace-agentic-4",
      streamResponseTokens: true,
    });

    expect(result.streaming.responseTokenStreamed).toBe(true);
    expect(result.streaming.chunkCount).toBeGreaterThan(0);
    const tokenUpdateCalls =
      agentService.appendEphemeralWorkflowUpdate.mock.calls.filter(
        (_call: unknown[]) =>
          (_call[2] as { stage?: string } | undefined)?.stage ===
          "response_token",
      );
    expect(tokenUpdateCalls.length).toBe(result.streaming.chunkCount);
    expect(tokenUpdateCalls[0]?.[2]).toEqual(
      expect.objectContaining({
        details: expect.objectContaining({
          source: "chunked_fallback",
        }),
      }),
    );
  });

  it("emits model_stream tokens when composeConversationResponse streams deltas", async () => {
    const { service, agentService, openai } = createServiceHarness();

    openai.planConversationTurn.mockResolvedValueOnce({
      specialists: [],
      toolCalls: [],
      responseGoal: "stream via onTextDelta",
    });
    openai.composeConversationResponse.mockImplementationOnce(
      async (_input, _trace, options) => {
        await options?.onTextDelta?.("Hello ");
        await options?.onTextDelta?.("world.");
        return "Hello world.";
      },
    );

    const result = await service.runAgenticTurn({
      threadId: IDS.threadId,
      userId: IDS.userId,
      content: "Stream deltas",
      traceId: "trace-agentic-stream-delta",
      streamResponseTokens: true,
    });

    expect(result.streaming.responseTokenStreamed).toBe(true);
    const tokenUpdateCalls =
      agentService.appendEphemeralWorkflowUpdate.mock.calls.filter(
        (_call: unknown[]) =>
          (_call[2] as { stage?: string } | undefined)?.stage ===
          "response_token",
      );
    expect(tokenUpdateCalls.length).toBeGreaterThan(0);
    expect(tokenUpdateCalls[0]?.[2]).toEqual(
      expect.objectContaining({
        details: expect.objectContaining({
          source: "model_stream",
        }),
      }),
    );
  });

  it("stores multimodal turn context and passes it to response synthesis", async () => {
    const { service, agentService, openai } = createServiceHarness();

    openai.planConversationTurn.mockResolvedValueOnce({
      specialists: ["intent_parser"],
      toolCalls: [],
      responseGoal: "ground response in multimodal inputs",
    });
    openai.composeConversationResponse.mockResolvedValueOnce(
      "I saw your screenshot and transcript. I can help from there.",
    );

    await service.runAgenticTurn({
      threadId: IDS.threadId,
      userId: IDS.userId,
      content: "Can you review this bug?",
      traceId: "trace-agentic-multimodal",
      voiceTranscript: "Need help debugging this crash path",
      attachments: [
        {
          kind: "image_url",
          url: "https://cdn.example.com/screenshot.png",
          caption: "stack trace screenshot",
        },
      ],
    });

    expect(agentService.createUserMessage).toHaveBeenCalledWith(
      IDS.threadId,
      expect.stringContaining("[Voice transcript]"),
      IDS.userId,
      expect.objectContaining({
        multimodal: expect.objectContaining({
          voiceTranscript: "Need help debugging this crash path",
          attachments: [
            expect.objectContaining({
              kind: "image_url",
              url: "https://cdn.example.com/screenshot.png",
            }),
          ],
        }),
      }),
    );
    expect(openai.planConversationTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        userMessage: expect.stringContaining("Need help debugging"),
        socialContext: expect.objectContaining({
          freshOnboardingTurn: true,
          interests: expect.arrayContaining(["Design", "AI"]),
          goals: expect.arrayContaining(["Meet people"]),
        }),
      }),
      "trace-agentic-multimodal",
    );
    expect(openai.composeConversationResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        userMessage: expect.stringContaining("[Voice transcript]"),
        socialContext: expect.objectContaining({
          profile: expect.objectContaining({
            displayName: "Alex Rivera",
          }),
          preferences: expect.objectContaining({
            timezone: "America/Argentina/Buenos_Aires",
          }),
        }),
      }),
      "trace-agentic-multimodal",
      undefined,
    );
  });

  it("uses the simple fast path for lightweight turns", async () => {
    const { service, openai, prisma, agentService } = createServiceHarness();

    openai.composeConversationResponse.mockResolvedValueOnce("Quick answer.");

    const result = await service.runAgenticTurn({
      threadId: IDS.threadId,
      userId: IDS.userId,
      content: "hey can you help me",
      traceId: "trace-agentic-fast-path",
    });

    expect(result.plan.specialists).toEqual([]);
    expect(result.plan.toolCalls).toEqual([]);
    expect(openai.planConversationTurn).not.toHaveBeenCalled();
    expect(prisma.agentMessage.findMany).not.toHaveBeenCalled();
    expect(agentService.appendWorkflowUpdate).toHaveBeenCalledWith(
      IDS.threadId,
      "Simple-turn fast path selected.",
      expect.objectContaining({
        stage: "fast_path_selected",
      }),
    );
  });

  it("denies tool execution when the pre-tool risk gate is blocked", async () => {
    const { service, openai, moderationService, prisma } =
      createServiceHarness();
    moderationService.assessContentRisk
      .mockReturnValueOnce({
        decision: "blocked",
        score: 1,
        reasons: ["blocked_term:bomb threat"],
      })
      .mockReturnValueOnce({
        decision: "clean",
        score: 0,
        reasons: ["clean"],
      });

    openai.planConversationTurn.mockResolvedValueOnce({
      specialists: ["intent_parser"],
      toolCalls: [
        {
          role: "manager",
          tool: "workflow.write",
          input: {
            content: "unsafe action",
          },
        },
      ],
      responseGoal: "unsafe",
    });

    const result = await service.runAgenticTurn({
      threadId: IDS.threadId,
      userId: IDS.userId,
      content: "bomb threat",
      traceId: "trace-agentic-risk-block",
    });

    expect(result.toolResults).toEqual([
      expect.objectContaining({
        status: "denied",
        reason: "blocked_by_risk_assessment",
      }),
    ]);
    expect(openai.composeConversationResponse).not.toHaveBeenCalled();
    expect(prisma.moderationFlag.create).toHaveBeenCalledTimes(1);
    expect(prisma.moderationFlag.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entityType: "agent_thread",
          entityId: IDS.threadId,
          status: "open",
          reason: expect.stringContaining("agent_pre_tools_blocked"),
        }),
      }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorType: "system",
          action: "moderation.agent_risk_assessed",
          entityType: "agent_thread",
          entityId: IDS.threadId,
          metadata: expect.objectContaining({
            traceId: "trace-agentic-risk-block",
            decision: "blocked",
            phase: "pre_tools",
          }),
        }),
      }),
    );
  });

  it("enforces human approval policy for risky actions", () => {
    const { service } = createServiceHarness();

    expect(
      service.assertActionAllowedForRole(
        "manager",
        "cancel_intent_flow",
        "medium",
      ),
    ).toEqual({ allowed: false, reason: "human_approval_required" });
    expect(
      service.assertActionAllowedForRole("manager", "widen_filters", "low"),
    ).toEqual({ allowed: true });
  });
});
