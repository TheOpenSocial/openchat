import { describe, expect, it, vi } from "vitest";
import { AgentService } from "../src/agent/agent.service.js";

describe("AgentService", () => {
  it("emits thread events for new user messages", async () => {
    const message = {
      id: "msg-1",
      threadId: "thread-1",
      role: "user",
      content: "hello",
      createdByUserId: "11111111-1111-4111-8111-111111111111",
      createdAt: new Date(),
    };

    const prisma: any = {
      agentMessage: {
        create: vi.fn().mockResolvedValue(message),
      },
    };

    const service = new AgentService(prisma);
    const listener = vi.fn();

    service.subscribeToThread("thread-1", listener);
    await service.createUserMessage(
      "thread-1",
      "hello",
      "11111111-1111-4111-8111-111111111111",
    );

    expect(listener).toHaveBeenCalledWith(message);
  });

  it("persists workflow updates with workflow role", async () => {
    const message = {
      id: "msg-2",
      threadId: "thread-1",
      role: "workflow",
      content: "I found 2 matches",
      createdByUserId: null,
      createdAt: new Date(),
      metadata: {
        intentId: "intent-1",
      },
    };

    const prisma: any = {
      agentMessage: {
        create: vi.fn().mockResolvedValue(message),
      },
    };

    const service = new AgentService(prisma);
    const result = await service.appendWorkflowUpdate(
      "thread-1",
      "I found 2 matches",
      { intentId: "intent-1" },
    );

    expect(result.role).toBe("workflow");
    expect(prisma.agentMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          role: "workflow",
        }),
      }),
    );
  });

  it("hides internal workflow stages from default history reads", async () => {
    const persistedMessages = [
      {
        id: "msg-risk",
        threadId: "thread-1",
        role: "workflow",
        content: "Risk check before response send: clean.",
        createdByUserId: null,
        createdAt: new Date("2026-03-25T21:00:00.000Z"),
        metadata: {
          stage: "risk_assessment_pre_send",
        },
      },
      {
        id: "msg-plan",
        threadId: "thread-1",
        role: "workflow",
        content: "Plan ready.",
        createdByUserId: null,
        createdAt: new Date("2026-03-25T21:00:01.000Z"),
        metadata: {
          stage: "plan_ready",
        },
      },
      {
        id: "msg-agent",
        threadId: "thread-1",
        role: "agent",
        content: "I’m on it.",
        createdByUserId: null,
        createdAt: new Date("2026-03-25T21:00:02.000Z"),
        metadata: null,
      },
    ];
    const prisma: any = {
      agentMessage: {
        findMany: vi.fn().mockResolvedValue(persistedMessages),
      },
    };
    const service = new AgentService(prisma);

    const filtered = await service.listThreadMessages("thread-1");
    expect(filtered.map((message) => message.id)).toEqual([
      "msg-plan",
      "msg-agent",
    ]);

    const unfiltered = await service.listThreadMessages("thread-1", {
      includeInternalWorkflow: true,
    });
    expect(unfiltered.map((message) => message.id)).toEqual([
      "msg-risk",
      "msg-plan",
      "msg-agent",
    ]);
  });
});
