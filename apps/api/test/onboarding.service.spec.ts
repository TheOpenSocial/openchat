import { describe, expect, it, vi } from "vitest";
import { OnboardingService } from "../src/onboarding/onboarding.service.js";

describe("OnboardingService activation plan", () => {
  it("builds deterministic fallback when activation context is missing", async () => {
    const service = new OnboardingService();
    const plan = await service.buildActivationPlan({
      userId: "11111111-1111-4111-8111-111111111111",
    });

    expect(plan.state).toBe("ready");
    expect(plan.source).toBe("fallback");
    expect(plan.recommendedAction.kind).toBe("agent_thread_seed");
    expect(plan.recommendedAction.text.length).toBeGreaterThan(10);
  });

  it("uses llm recommendation when quick inference succeeds", async () => {
    const service = new OnboardingService();
    (service as any).resolveClient = vi.fn().mockReturnValue({
      inferOnboardingQuick: vi.fn().mockResolvedValue({
        transcript: "I want to meet thoughtful people around design.",
        interests: ["design"],
        goals: ["meet people"],
        summary: "You want design-oriented social plans.",
        firstIntent:
          "Help me connect with thoughtful people around design this week.",
      }),
    });

    const plan = await service.buildActivationPlan({
      userId: "11111111-1111-4111-8111-111111111111",
      summary: "I want thoughtful design connections.",
      interests: ["design"],
    });

    expect(plan.state).toBe("ready");
    expect(plan.source).toBe("llm");
    expect(plan.recommendedAction.text).toContain("design");
  });

  it("falls back when llm recommendation is unavailable", async () => {
    const service = new OnboardingService();
    (service as any).resolveClient = vi.fn().mockReturnValue({
      inferOnboardingQuick: vi.fn().mockResolvedValue(null),
    });

    const plan = await service.buildActivationPlan({
      userId: "11111111-1111-4111-8111-111111111111",
      interests: ["football", "coffee"],
      city: "Buenos Aires",
    });

    expect(plan.source).toBe("fallback");
    expect(plan.recommendedAction.text).toContain("Buenos Aires");
  });
});
