import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { AgentController } from "../src/agent/agent.controller.js";

function createController(overrides?: {
  agentService?: Record<string, unknown>;
  agentConversationService?: Record<string, unknown>;
  clientMutationService?: Record<string, unknown>;
}) {
  const agentService: any = {
    findPrimaryThreadSummaryForUser: vi.fn(),
    assertThreadOwnership: vi.fn().mockResolvedValue(undefined),
    subscribeToThread: vi.fn(),
    unsubscribeFromThread: vi.fn(),
    listThreadMessages: vi.fn(),
    createUserMessage: vi.fn(),
    ...(overrides?.agentService ?? {}),
  };
  const agentConversationService: any = {
    runAgenticTurn: vi.fn(),
    listPlanCheckpoints: vi.fn(),
    resolvePlanCheckpoint: vi.fn(),
    ...(overrides?.agentConversationService ?? {}),
  };
  const clientMutationService: any = {
    run: vi.fn(async ({ handler }: { handler: () => Promise<unknown> }) =>
      handler(),
    ),
    ...(overrides?.clientMutationService ?? {}),
  };

  return {
    agentService,
    agentConversationService,
    clientMutationService,
    controller: new AgentController(
      agentService,
      agentConversationService,
      clientMutationService,
    ),
  };
}

describe("AgentController", () => {
  it("returns primary thread summary for me/summary", async () => {
    const userId = "22222222-2222-4222-8222-222222222222";
    const summary = {
      id: "11111111-1111-4111-8111-111111111111",
      title: "Main",
      createdAt: new Date("2025-01-01T00:00:00.000Z"),
    };

    const { controller, agentService } = createController({
      agentService: {
        findPrimaryThreadSummaryForUser: vi.fn().mockResolvedValue(summary),
      },
    });

    const result = await controller.getMyThreadSummary(userId);

    expect(agentService.findPrimaryThreadSummaryForUser).toHaveBeenCalledWith(
      userId,
    );
    expect(result.success).toBe(true);
    expect(result.data).toEqual(summary);
  });

  it("runs a full agentic turn via respond endpoint", async () => {
    const threadId = "11111111-1111-4111-8111-111111111111";
    const userId = "22222222-2222-4222-8222-222222222222";

    const {
      controller,
      agentService,
      agentConversationService,
      clientMutationService,
    } = createController({
      agentConversationService: {
        runAgenticTurn: vi.fn().mockResolvedValue({
          traceId: "trace-agentic-respond",
          userMessageId: "user-msg",
          agentMessageId: "agent-msg",
          plan: {
            specialists: ["intent_parser"],
            toolCalls: [],
            responseGoal: "clarify one constraint",
          },
          toolResults: [],
          specialistNotes: [
            {
              role: "intent_parser",
              status: "executed",
            },
          ],
        }),
      },
    });

    const result = await controller.respond(
      threadId,
      {
        userId,
        content: "Need someone for a quick coding chat",
        traceId: "trace-agentic-respond",
      },
      userId,
    );

    expect(agentService.assertThreadOwnership).toHaveBeenCalledWith(
      threadId,
      userId,
    );
    expect(clientMutationService.run).toHaveBeenCalledWith({
      userId,
      scope: "agent.respond",
      idempotencyKey: undefined,
      handler: expect.any(Function),
    });
    expect(agentConversationService.runAgenticTurn).toHaveBeenCalledWith({
      threadId,
      userId,
      content: "Need someone for a quick coding chat",
      traceId: "trace-agentic-respond",
      streamResponseTokens: undefined,
      voiceTranscript: undefined,
      attachments: undefined,
    });
    expect(result).toEqual({
      success: true,
      data: expect.objectContaining({
        traceId: "trace-agentic-respond",
        userMessageId: "user-msg",
        agentMessageId: "agent-msg",
      }),
      traceId: "trace-agentic-respond",
    });
  });

  it("passes idempotency key through respond endpoint", async () => {
    const threadId = "11111111-1111-4111-8111-111111111111";
    const userId = "22222222-2222-4222-8222-222222222222";

    const { controller, clientMutationService } = createController({
      agentConversationService: {
        runAgenticTurn: vi.fn().mockResolvedValue({
          traceId: "trace-idempotent",
          userMessageId: "user-msg",
          agentMessageId: "agent-msg",
          plan: {},
          toolResults: [],
          specialistNotes: [],
        }),
      },
    });

    await controller.respond(
      threadId,
      {
        userId,
        content: "try again safely",
      },
      userId,
      "mobile-outbox-1",
    );

    expect(clientMutationService.run).toHaveBeenCalledWith({
      userId,
      scope: "agent.respond",
      idempotencyKey: "mobile-outbox-1",
      handler: expect.any(Function),
    });
  });

  it("rejects respond when payload user does not match authenticated actor", async () => {
    const threadId = "11111111-1111-4111-8111-111111111111";
    const actorUserId = "22222222-2222-4222-8222-222222222222";
    const differentUserId = "33333333-3333-4333-8333-333333333333";

    const { controller, agentConversationService } = createController();

    await expect(
      controller.respond(
        threadId,
        {
          userId: differentUserId,
          content: "mismatched actor",
        },
        actorUserId,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(agentConversationService.runAgenticTurn).not.toHaveBeenCalled();
  });

  it("forces response-token streaming on respond/stream endpoint", async () => {
    const threadId = "11111111-1111-4111-8111-111111111111";
    const userId = "22222222-2222-4222-8222-222222222222";

    const { controller, agentConversationService, clientMutationService } =
      createController({
        agentConversationService: {
          runAgenticTurn: vi.fn().mockResolvedValue({
            traceId: "trace-agentic-stream",
            userMessageId: "user-msg",
            agentMessageId: "agent-msg",
            plan: {
              specialists: ["intent_parser"],
              toolCalls: [],
              responseGoal: "stream",
            },
            toolResults: [],
            specialistNotes: [],
            streaming: {
              responseTokenStreamed: true,
              chunkCount: 3,
            },
          }),
        },
      });

    await controller.respondStream(
      threadId,
      {
        userId,
        content: "stream this response",
        streamResponseTokens: false,
      },
      userId,
    );

    expect(clientMutationService.run).toHaveBeenCalledWith({
      userId,
      scope: "agent.respond_stream",
      idempotencyKey: undefined,
      handler: expect.any(Function),
    });
    expect(agentConversationService.runAgenticTurn).toHaveBeenCalledWith({
      threadId,
      userId,
      content: "stream this response",
      traceId: undefined,
      streamResponseTokens: true,
      voiceTranscript: undefined,
      attachments: undefined,
    });
  });

  it("forwards multimodal payload fields to runAgenticTurn", async () => {
    const threadId = "11111111-1111-4111-8111-111111111111";
    const userId = "22222222-2222-4222-8222-222222222222";

    const { controller, agentConversationService } = createController({
      agentConversationService: {
        runAgenticTurn: vi.fn().mockResolvedValue({
          traceId: "trace-agentic-multimodal",
          userMessageId: "user-msg",
          agentMessageId: "agent-msg",
          plan: {
            specialists: [],
            toolCalls: [],
            responseGoal: null,
          },
          toolResults: [],
          specialistNotes: [],
        }),
      },
    });

    await controller.respond(
      threadId,
      {
        userId,
        content: "Please review this issue",
        voiceTranscript: "I attached a screenshot for context",
        attachments: [
          {
            kind: "image_url",
            url: "https://cdn.example.com/capture.png",
          },
        ],
      },
      userId,
    );

    expect(agentConversationService.runAgenticTurn).toHaveBeenCalledWith({
      threadId,
      userId,
      content: "Please review this issue",
      traceId: undefined,
      streamResponseTokens: undefined,
      voiceTranscript: "I attached a screenshot for context",
      attachments: [
        {
          kind: "image_url",
          url: "https://cdn.example.com/capture.png",
        },
      ],
    });
  });

  it("lists thread messages hiding internal workflow history by default", async () => {
    const threadId = "11111111-1111-4111-8111-111111111111";
    const userId = "22222222-2222-4222-8222-222222222222";
    const messages = [
      {
        id: "msg-plan",
        role: "workflow",
        content: "Plan ready.",
      },
    ];
    const { controller, agentService } = createController({
      agentService: {
        listThreadMessages: vi.fn().mockResolvedValue(messages),
      },
    });

    const result = await controller.getMessages(threadId, undefined, userId);

    expect(agentService.assertThreadOwnership).toHaveBeenCalledWith(
      threadId,
      userId,
    );
    expect(agentService.listThreadMessages).toHaveBeenCalledWith(threadId, {
      includeInternalWorkflow: false,
    });
    expect(result).toEqual({
      success: true,
      data: messages,
    });
  });

  it("allows including internal workflow history via query flag", async () => {
    const threadId = "11111111-1111-4111-8111-111111111111";
    const userId = "22222222-2222-4222-8222-222222222222";
    const { controller, agentService } = createController({
      agentService: {
        listThreadMessages: vi.fn().mockResolvedValue([]),
      },
    });

    await controller.getMessages(threadId, "true", userId);

    expect(agentService.listThreadMessages).toHaveBeenCalledWith(threadId, {
      includeInternalWorkflow: true,
    });
  });

  it("rejects invalid includeInternalWorkflow query values", async () => {
    const threadId = "11111111-1111-4111-8111-111111111111";
    const userId = "22222222-2222-4222-8222-222222222222";
    const { controller, agentService } = createController();

    await expect(
      controller.getMessages(threadId, "maybe", userId),
    ).rejects.toThrow("boolean query must be true or false");
    expect(agentService.listThreadMessages).not.toHaveBeenCalled();
  });

  it("lists and resolves plan checkpoints", async () => {
    const threadId = "11111111-1111-4111-8111-111111111111";
    const checkpointId = "44444444-4444-4444-8444-444444444444";
    const userId = "22222222-2222-4222-8222-222222222222";

    const { controller, agentConversationService } = createController({
      agentConversationService: {
        listPlanCheckpoints: vi
          .fn()
          .mockResolvedValue([
            { id: checkpointId, threadId, status: "pending" },
          ]),
        resolvePlanCheckpoint: vi
          .fn()
          .mockResolvedValue({ id: checkpointId, status: "approved" }),
      },
    });

    const listResult = await controller.listPlanCheckpoints(
      threadId,
      { status: "pending", limit: 10 },
      userId,
    );
    expect(listResult.success).toBe(true);
    expect(agentConversationService.listPlanCheckpoints).toHaveBeenCalledWith({
      threadId,
      status: "pending",
      limit: 10,
    });

    const approveResult = await controller.approvePlanCheckpoint(
      threadId,
      checkpointId,
      {
        userId,
        reason: "approved",
      },
      userId,
    );
    expect(approveResult.success).toBe(true);
    expect(agentConversationService.resolvePlanCheckpoint).toHaveBeenCalledWith(
      {
        threadId,
        checkpointId,
        actorUserId: userId,
        decision: "approved",
        reason: "approved",
      },
    );
  });
});
