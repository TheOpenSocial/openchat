import { describe, expect, it } from "vitest";
import { AgentConversationService } from "../src/agent/agent-conversation.service.js";

describe("AgentConversationService integration", () => {
  it("runs plan->tools->specialists->response using deterministic OpenAI fallbacks", async () => {
    const previousApiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    try {
      const threadId = "11111111-1111-4111-8111-111111111111";
      const userId = "22222222-2222-4222-8222-222222222222";
      const baseMessage = {
        id: "history-msg-1",
        threadId,
        role: "user",
        content: "Need someone to chat tonight",
        createdByUserId: userId,
        createdAt: new Date("2026-03-20T10:00:00.000Z"),
      };

      const workflowUpdates: Array<{
        content: string;
        metadata: Record<string, unknown> | undefined;
      }> = [];
      const ephemeralWorkflowUpdates: Array<{
        content: string;
        metadata: Record<string, unknown> | undefined;
      }> = [];
      const agentMessages: Array<{ content: string }> = [];

      const prisma: any = {
        agentMessage: {
          findMany: async () => [baseMessage],
        },
        retrievalDocument: {
          findMany: async () => [],
        },
      };

      const agentService: any = {
        createUserMessage: async (
          targetThreadId: string,
          content: string,
          createdByUserId: string,
        ) => ({
          id: "user-msg-1",
          threadId: targetThreadId,
          role: "user",
          content,
          createdByUserId,
          createdAt: new Date("2026-03-20T11:00:00.000Z"),
        }),
        appendWorkflowUpdate: async (
          _targetThreadId: string,
          content: string,
          metadata?: Record<string, unknown>,
        ) => {
          workflowUpdates.push({ content, metadata });
          return {
            id: `workflow-${workflowUpdates.length}`,
            threadId,
            role: "workflow",
            content,
            createdByUserId: null,
            createdAt: new Date(),
            metadata,
          };
        },
        appendEphemeralWorkflowUpdate: (
          _targetThreadId: string,
          content: string,
          metadata?: Record<string, unknown>,
        ) => {
          ephemeralWorkflowUpdates.push({ content, metadata });
          return {
            id: `ephemeral-${ephemeralWorkflowUpdates.length}`,
            threadId,
            role: "workflow",
            content,
            createdByUserId: null,
            createdAt: new Date(),
            metadata,
          };
        },
        createAgentMessage: async (
          _targetThreadId: string,
          content: string,
        ) => {
          agentMessages.push({ content });
          return {
            id: "agent-msg-1",
            threadId,
            role: "agent",
            content,
            createdByUserId: null,
            createdAt: new Date("2026-03-20T11:00:05.000Z"),
          };
        },
      };

      const appCacheService: any = {
        getJson: async () => null,
        setJson: async () => undefined,
        delete: async () => undefined,
      };

      const service = new AgentConversationService(
        prisma,
        agentService,
        appCacheService,
      );
      const result = await service.runAgenticTurn({
        threadId,
        userId,
        content: "Need someone to chat tonight",
        traceId: "trace-agentic-int-1",
        streamResponseTokens: true,
      });

      expect(result.plan.specialists).toEqual(
        expect.arrayContaining([
          "intent_parser",
          "moderation_assistant",
          "notification_copy",
        ]),
      );
      expect(result.toolResults).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            tool: "workflow.read",
            status: "executed",
          }),
          expect.objectContaining({
            tool: "intent.parse",
            status: "executed",
          }),
          expect.objectContaining({
            tool: "moderation.review",
            status: "executed",
          }),
        ]),
      );
      expect(agentMessages).toHaveLength(1);
      expect(result.streaming.responseTokenStreamed).toBe(true);
      expect(result.streaming.chunkCount).toBeGreaterThan(0);

      const tokenUpdates = ephemeralWorkflowUpdates.filter(
        (update) => update.metadata?.stage === "response_token",
      );
      expect(tokenUpdates.length).toBe(result.streaming.chunkCount);
      expect(
        workflowUpdates.some(
          (update) => update.metadata?.stage === "plan_ready",
        ),
      ).toBe(true);
      expect(
        workflowUpdates.some(
          (update) => update.metadata?.stage === "turn_completed",
        ),
      ).toBe(true);
    } finally {
      if (previousApiKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = previousApiKey;
      }
    }
  });
});
