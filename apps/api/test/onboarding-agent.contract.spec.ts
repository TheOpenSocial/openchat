import { describe, expect, it, vi } from "vitest";
import { AgentController } from "../src/agent/agent.controller.js";
import { OnboardingController } from "../src/onboarding/onboarding.controller.js";

describe("API endpoint contract regression", () => {
  it("keeps onboarding infer response envelope and payload shape stable", async () => {
    const onboardingService = {
      inferFromTranscript: vi.fn().mockResolvedValue({
        transcript: "Looking for people into design and football.",
        interests: ["design", "football"],
        goals: ["meet people", "make plans"],
        mode: "social",
        format: "small_groups",
        style: "Chill",
        availability: "Flexible",
        area: "Buenos Aires",
        country: "Argentina",
        persona: "Connector",
        summary:
          "Looking for thoughtful social plans around design and football.",
        firstIntent: "Help me find thoughtful design and football plans.",
      }),
    } as any;

    const controller = new OnboardingController(onboardingService);
    const userId = "11111111-1111-4111-8111-111111111111";
    const response = await controller.infer(
      {
        userId,
        transcript: "Looking for people into design and football.",
      },
      userId,
    );

    expect(response).toEqual(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          transcript: expect.any(String),
          interests: expect.any(Array),
          goals: expect.any(Array),
          mode: expect.any(String),
          format: expect.any(String),
          style: expect.any(String),
          availability: expect.any(String),
          country: expect.any(String),
          summary: expect.any(String),
        }),
      }),
    );
  });

  it("keeps onboarding infer-fast response envelope and payload shape stable", async () => {
    const onboardingService = {
      inferQuickFromTranscript: vi.fn().mockResolvedValue({
        transcript: "Looking for people into design and football.",
        interests: ["design", "football"],
        goals: ["meet people"],
        summary: "Looking for social plans.",
        firstIntent: "Find me people for social plans.",
        followUpQuestion: "Do you prefer 1:1 or small groups?",
      }),
    } as any;

    const controller = new OnboardingController(onboardingService);
    const userId = "11111111-1111-4111-8111-111111111111";
    const response = await controller.inferFast(
      {
        userId,
        transcript: "Looking for people into design and football.",
      },
      userId,
    );

    expect(response).toEqual(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          transcript: expect.any(String),
          interests: expect.any(Array),
          goals: expect.any(Array),
          summary: expect.any(String),
          firstIntent: expect.any(String),
        }),
      }),
    );
  });

  it("keeps agent respond response envelope and core fields stable", async () => {
    const agentService = {
      assertThreadOwnership: vi.fn().mockResolvedValue(undefined),
    } as any;
    const agentConversationService = {
      runAgenticTurn: vi.fn().mockResolvedValue({
        traceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        threadId: "22222222-2222-4222-8222-222222222222",
        assistantMessage: {
          id: "33333333-3333-4333-8333-333333333333",
          role: "assistant",
          content: "Got it, I can help with that.",
        },
      }),
    } as any;
    const clientMutationService = {
      run: vi.fn(async ({ handler }) => handler()),
    } as any;

    const controller = new AgentController(
      agentService,
      agentConversationService,
      clientMutationService,
    );

    const userId = "11111111-1111-4111-8111-111111111111";
    const threadId = "22222222-2222-4222-8222-222222222222";

    const response = await controller.respond(
      threadId,
      {
        userId,
        content: "Help me find people into design.",
      },
      userId,
      "idempotency-key-123",
    );

    expect(response).toEqual(
      expect.objectContaining({
        success: true,
        traceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        data: expect.objectContaining({
          traceId: expect.any(String),
          threadId: threadId,
          assistantMessage: expect.objectContaining({
            id: expect.any(String),
            role: "assistant",
            content: expect.any(String),
          }),
        }),
      }),
    );
  });
});
