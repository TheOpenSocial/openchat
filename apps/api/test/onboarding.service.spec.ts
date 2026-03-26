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
    expect(plan.idempotencyKey).toMatch(
      /^onboarding-carryover:11111111-1111-4111-8111-111111111111:/,
    );
    expect(plan.activationFingerprint.length).toBe(16);
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
    expect(plan.idempotencyKey).toMatch(
      /^onboarding-carryover:11111111-1111-4111-8111-111111111111:/,
    );
  });

  it("falls back when llm recommendation is weak/empty", async () => {
    const service = new OnboardingService();
    (service as any).resolveClient = vi.fn().mockReturnValue({
      inferOnboardingQuick: vi.fn().mockResolvedValue({
        transcript: "I want to connect with founders.",
        interests: ["startups"],
        goals: ["meet people"],
        summary: "You want to connect with founders.",
        firstIntent: "   ",
      }),
    });

    const plan = await service.buildActivationPlan({
      userId: "11111111-1111-4111-8111-111111111111",
      summary: "I want to connect with founders.",
      interests: ["startups"],
    });

    expect(plan.source).toBe("fallback");
    expect(plan.recommendedAction.text.length).toBeGreaterThan(10);
  });

  it("returns stable activation identity for identical activation context", async () => {
    const service = new OnboardingService();
    (service as any).resolveClient = vi.fn().mockReturnValue({
      inferOnboardingQuick: vi.fn().mockResolvedValue({
        transcript: "I want to meet people around football in Buenos Aires.",
        interests: ["football"],
        goals: ["meet people"],
        summary: "You want football plans in Buenos Aires.",
        firstIntent: "Help me find football plans in Buenos Aires.",
      }),
    });

    const input = {
      userId: "11111111-1111-4111-8111-111111111111",
      summary: "I want football plans in Buenos Aires.",
      interests: ["football"],
      city: "Buenos Aires",
      country: "Argentina",
    };

    const first = await service.buildActivationPlan(input);
    const second = await service.buildActivationPlan(input);
    expect(first.idempotencyKey).toBe(second.idempotencyKey);
    expect(first.activationFingerprint).toBe(second.activationFingerprint);
  });

  it("keeps activation identity stable across service restarts", async () => {
    const input = {
      userId: "11111111-1111-4111-8111-111111111111",
      summary: "I want football plans in Buenos Aires.",
      interests: ["football"],
      city: "Buenos Aires",
      country: "Argentina",
    };

    const firstService = new OnboardingService();
    (firstService as any).resolveClient = vi.fn().mockReturnValue({
      inferOnboardingQuick: vi.fn().mockResolvedValue(null),
    });
    const first = await firstService.buildActivationPlan(input);

    const secondService = new OnboardingService();
    (secondService as any).resolveClient = vi.fn().mockReturnValue({
      inferOnboardingQuick: vi.fn().mockResolvedValue(null),
    });
    const second = await secondService.buildActivationPlan(input);

    expect(first.source).toBe("fallback");
    expect(second.source).toBe("fallback");
    expect(first.idempotencyKey).toBe(second.idempotencyKey);
    expect(first.activationFingerprint).toBe(second.activationFingerprint);
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

  it("normalizes generic rich persona/summary into concrete output", async () => {
    const service = new OnboardingService();
    (service as any).resolveClient = vi.fn().mockReturnValue({
      inferOnboarding: vi.fn().mockResolvedValue({
        transcript: "I want local football and design plans this weekend.",
        interests: ["football", "design"],
        goals: ["meet people"],
        mode: "social",
        format: "small_groups",
        style: "Chill",
        availability: "Weekends",
        area: "Buenos Aires",
        country: "Argentina",
        persona: "Connector",
        summary: "meet people",
        firstIntent: "Find football and design plans.",
        followUpQuestion: "",
      }),
    });

    const result = await service.inferFromTranscript(
      "11111111-1111-4111-8111-111111111111",
      "I want local football and design plans this weekend.",
    );

    expect(result.persona.toLowerCase()).not.toBe("connector");
    expect(result.summary.toLowerCase()).not.toBe("meet people");
    expect(result.summary.toLowerCase()).toContain("football");
    expect(result.lifecycle?.current).toBe("infer-success");
  });

  it("normalizes generic quick summary into concrete output", async () => {
    const service = new OnboardingService();
    (service as any).resolveClient = vi.fn().mockReturnValue({
      inferOnboardingQuick: vi.fn().mockResolvedValue({
        transcript: "I like startup chats and coffee meetups.",
        interests: ["startups", "coffee"],
        goals: ["meet people"],
        summary: "social plans",
        firstIntent: "Find social plans around startups.",
        followUpQuestion: "",
      }),
    });

    const result = await service.inferQuickFromTranscript(
      "11111111-1111-4111-8111-111111111111",
      "I like startup chats and coffee meetups.",
    );

    expect(result.summary.toLowerCase()).not.toBe("social plans");
    expect(result.summary.toLowerCase()).toContain("startups");
    expect(result.lifecycle?.current).toBe("infer-success");
  });
});
