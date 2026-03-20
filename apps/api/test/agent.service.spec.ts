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
});
