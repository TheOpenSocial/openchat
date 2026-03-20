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

  const service = new AgentConversationService(
    prisma,
    agentService,
    moderationService,
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
  };
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

  it("blocks risky tool actions that require human approval", async () => {
    const { service, openai } = createServiceHarness();

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
      }),
    ]);
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
      agentService.appendWorkflowUpdate.mock.calls.filter(
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
      agentService.appendWorkflowUpdate.mock.calls.filter(
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
      }),
      "trace-agentic-multimodal",
    );
    expect(openai.composeConversationResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        userMessage: expect.stringContaining("[Voice transcript]"),
      }),
      "trace-agentic-multimodal",
      undefined,
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
