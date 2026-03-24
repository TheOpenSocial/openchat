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

  it("falls back quickly when fast inference exceeds service timeout", async () => {
    const previousTimeout = process.env.ONBOARDING_LLM_TIMEOUT_MS;
    process.env.ONBOARDING_LLM_TIMEOUT_MS = "1000";
    vi.useFakeTimers();

    try {
      const service = new OnboardingService();
      (service as any).resolveClient = vi.fn().mockReturnValue({
        inferOnboardingQuick: vi.fn(() => new Promise(() => {})),
      });

      const pending = service.inferQuickFromTranscript(
        "11111111-1111-4111-8111-111111111111",
        "I want to meet people around design.",
      );
      await vi.advanceTimersByTimeAsync(1_100);
      const result = await pending;

      expect(result.summary.length).toBeGreaterThan(0);
      expect(result.firstIntent.length).toBeGreaterThan(0);
      expect(result.lifecycle?.current).toBe("infer-fallback");
      expect(result.lifecycle?.transitions).toEqual([
        "infer-started",
        "infer-processing",
        "infer-fallback",
      ]);
    } finally {
      vi.useRealTimers();
      if (previousTimeout === undefined) {
        delete process.env.ONBOARDING_LLM_TIMEOUT_MS;
      } else {
        process.env.ONBOARDING_LLM_TIMEOUT_MS = previousTimeout;
      }
    }
  });

  it("falls back activation plan when quick inference times out", async () => {
    const previousTimeout = process.env.ONBOARDING_LLM_TIMEOUT_MS;
    process.env.ONBOARDING_LLM_TIMEOUT_MS = "1000";
    vi.useFakeTimers();

    try {
      const service = new OnboardingService();
      (service as any).resolveClient = vi.fn().mockReturnValue({
        inferOnboardingQuick: vi.fn(() => new Promise(() => {})),
      });

      const pending = service.buildActivationPlan({
        userId: "11111111-1111-4111-8111-111111111111",
        summary: "Looking to find thoughtful people.",
      });
      await vi.advanceTimersByTimeAsync(1_100);
      const plan = await pending;

      expect(plan.state).toBe("ready");
      expect(plan.source).toBe("fallback");
      expect(plan.recommendedAction.kind).toBe("agent_thread_seed");
    } finally {
      vi.useRealTimers();
      if (previousTimeout === undefined) {
        delete process.env.ONBOARDING_LLM_TIMEOUT_MS;
      } else {
        process.env.ONBOARDING_LLM_TIMEOUT_MS = previousTimeout;
      }
    }
  });

  it("returns lifecycle success state when quick inference succeeds", async () => {
    const service = new OnboardingService();
    (service as any).resolveClient = vi.fn().mockReturnValue({
      inferOnboardingQuick: vi.fn().mockResolvedValue({
        transcript: "I enjoy design jams and football nights.",
        interests: ["design", "football"],
        goals: ["meet people"],
        summary: "You enjoy social design and football plans.",
        firstIntent: "Help me meet people into design and football.",
      }),
    });

    const result = await service.inferQuickFromTranscript(
      "11111111-1111-4111-8111-111111111111",
      "I enjoy design jams and football nights.",
    );

    expect(result.lifecycle?.current).toBe("infer-success");
    expect(result.lifecycle?.transitions).toEqual([
      "infer-started",
      "infer-processing",
      "infer-success",
    ]);
  });
});
