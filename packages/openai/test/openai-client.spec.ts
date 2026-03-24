import { afterEach, describe, expect, it, vi } from "vitest";
import { trace } from "@opentelemetry/api";

vi.mock("@openai/agents", async () => {
  return {
    Agent: class {
      name: string;
      instructions: string;
      model: string;
      constructor(config: {
        name: string;
        instructions: string;
        model: string;
      }) {
        this.name = config.name;
        this.instructions = config.instructions;
        this.model = config.model;
      }
    },
    run: vi.fn(),
    setDefaultOpenAIClient: vi.fn(),
    setOpenAIAPI: vi.fn(),
  };
});

import { run } from "@openai/agents";
import {
  OpenAIClient,
  OpenAIFailureStore,
  getOpenAIBudgetGuardrailSnapshot,
} from "../src/index.js";

describe("@opensocial/openai OpenAIClient", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("parses intent with structured output through Agents SDK", async () => {
    vi.mocked(run).mockResolvedValueOnce({
      finalOutput: JSON.stringify({
        version: 1,
        rawText: "Need tennis now",
        intentType: "activity",
        urgency: "now",
        topics: ["tennis"],
        activities: ["play"],
        timingConstraints: ["now"],
        skillConstraints: [],
        vibeConstraints: [],
        confidence: 0.92,
        requiresFollowUp: false,
      }),
    } as never);

    const client = new OpenAIClient({
      apiKey: "enabled",
      defaultModel: "gpt-4.1-mini",
    });

    const result = await client.parseIntent("Need tennis now", "trace-parse-1");

    expect(result.intentType).toBe("activity");
    expect(result.topics).toContain("tennis");
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("falls back safely and captures schema parse failures", async () => {
    const failureStore = new OpenAIFailureStore();
    vi.mocked(run).mockResolvedValueOnce({
      finalOutput: JSON.stringify({
        malformed: true,
      }),
    } as never);

    const client = new OpenAIClient({
      apiKey: "enabled",
      defaultModel: "gpt-4.1-mini",
      failureStore,
    });

    const result = await client.parseIntent("Need tennis now", "trace-parse-2");

    expect(result.rawText).toBe("Need tennis now");
    const failures = client.listCapturedFailures("intent_parsing");
    expect(failures.some((f) => f.reason === "schema_parse_failed")).toBe(true);
  });

  it("streams composed response text through onTextDelta callback", async () => {
    vi.mocked(run).mockResolvedValueOnce({
      finalOutput: "Sure, let's get this moving.",
    } as never);

    const client = new OpenAIClient({
      apiKey: "enabled",
      defaultModel: "gpt-4.1-mini",
    });
    const deltas: string[] = [];

    const response = await client.composeConversationResponse(
      { userMessage: "Help me find a study buddy" },
      "trace-response-1",
      {
        onTextDelta: (delta) => {
          deltas.push(delta);
        },
      },
    );

    expect(response).toBe("Sure, let's get this moving.");
    expect(deltas).toEqual(["Sure, let's get this moving."]);
  });

  it("short-circuits response generation when budget guardrail is exceeded", async () => {
    const prevBudget =
      process.env.OPENAI_BUDGET_MAX_ESTIMATED_COST_USD_PER_RESPONSE;
    const prevInput = process.env.OPENAI_ESTIMATED_INPUT_COST_PER_1K_TOKENS_USD;
    const prevOutput =
      process.env.OPENAI_ESTIMATED_OUTPUT_COST_PER_1K_TOKENS_USD;
    process.env.OPENAI_BUDGET_MAX_ESTIMATED_COST_USD_PER_RESPONSE = "0.0001";
    process.env.OPENAI_ESTIMATED_INPUT_COST_PER_1K_TOKENS_USD = "1";
    process.env.OPENAI_ESTIMATED_OUTPUT_COST_PER_1K_TOKENS_USD = "1";

    try {
      const client = new OpenAIClient({
        apiKey: "enabled",
        defaultModel: "gpt-4.1-mini",
      });
      const response = await client.composeConversationResponse(
        { userMessage: "Generate a very long, detailed answer." },
        "trace-budget-1",
      );

      expect(response.length).toBeGreaterThan(0);
      expect(run).not.toHaveBeenCalled();
      const failures = client.listCapturedFailures("conversation_response");
      expect(
        failures.some(
          (failure) => failure.reason === "budget_guardrail_exceeded",
        ),
      ).toBe(true);
    } finally {
      if (prevBudget === undefined) {
        delete process.env.OPENAI_BUDGET_MAX_ESTIMATED_COST_USD_PER_RESPONSE;
      } else {
        process.env.OPENAI_BUDGET_MAX_ESTIMATED_COST_USD_PER_RESPONSE =
          prevBudget;
      }
      if (prevInput === undefined) {
        delete process.env.OPENAI_ESTIMATED_INPUT_COST_PER_1K_TOKENS_USD;
      } else {
        process.env.OPENAI_ESTIMATED_INPUT_COST_PER_1K_TOKENS_USD = prevInput;
      }
      if (prevOutput === undefined) {
        delete process.env.OPENAI_ESTIMATED_OUTPUT_COST_PER_1K_TOKENS_USD;
      } else {
        process.env.OPENAI_ESTIMATED_OUTPUT_COST_PER_1K_TOKENS_USD = prevOutput;
      }
    }
  });

  it("replays captured failures for intent parsing", async () => {
    const failureStore = new OpenAIFailureStore();
    vi.mocked(run)
      .mockRejectedValueOnce(new Error("synthetic outage"))
      .mockResolvedValueOnce({
        finalOutput: JSON.stringify({
          version: 1,
          rawText: "Need tennis now",
          intentType: "activity",
          urgency: "now",
          topics: ["tennis"],
          activities: ["play"],
          timingConstraints: ["now"],
          skillConstraints: [],
          vibeConstraints: [],
          confidence: 0.9,
          requiresFollowUp: false,
        }),
      } as never);

    const client = new OpenAIClient({
      apiKey: "enabled",
      defaultModel: "gpt-4.1-mini",
      failureStore,
    });

    const fallback = await client.parseIntent(
      "Need tennis now",
      "trace-replay-1",
    );
    expect(fallback.intentType).toBe("chat");

    const captured = client.listCapturedFailures("intent_parsing");
    expect(captured).toHaveLength(1);

    const replay = await client.replayCapturedFailure(
      captured[0]!.id,
      "trace-replay-2",
    );
    expect(replay.status).toBe("replayed");
    expect((replay as any).result.intentType).toBe("activity");
  });

  it("includes active OpenTelemetry trace identifiers in trace metadata", () => {
    const client = new OpenAIClient({
      apiKey: "enabled",
      defaultModel: "gpt-4.1-mini",
    });

    vi.spyOn(trace, "getSpan").mockReturnValue({
      spanContext: () => ({
        traceId: "0123456789abcdef0123456789abcdef",
        spanId: "0123456789abcdef",
        traceFlags: 1,
      }),
    } as any);
    const metadata = client.createTraceMetadata(
      "trace-meta-1",
      "intent_parsing",
      {
        attempt: 1,
      },
    );

    expect(metadata.traceId).toBe("trace-meta-1");
    expect(metadata.otelTraceId).toBe("0123456789abcdef0123456789abcdef");
    expect(metadata.otelSpanId).toBe("0123456789abcdef");
    expect(metadata.attempt).toBe("1");
  });

  it("updates budget guardrail snapshot when circuit opens after repeated failures", async () => {
    const previousThreshold =
      process.env.OPENAI_BUDGET_CIRCUIT_FAILURE_THRESHOLD;
    const previousCooldown = process.env.OPENAI_BUDGET_CIRCUIT_COOLDOWN_MS;
    process.env.OPENAI_BUDGET_CIRCUIT_FAILURE_THRESHOLD = "2";
    process.env.OPENAI_BUDGET_CIRCUIT_COOLDOWN_MS = "60000";

    try {
      vi.mocked(run)
        .mockRejectedValueOnce(new Error("synthetic timeout 1"))
        .mockRejectedValueOnce(new Error("synthetic timeout 2"));

      const client = new OpenAIClient({
        apiKey: "enabled",
        defaultModel: "gpt-4.1-mini",
      });

      await client.composeConversationResponse(
        { userMessage: "First attempt" },
        "trace-circuit-open-1",
      );
      await client.composeConversationResponse(
        { userMessage: "Second attempt" },
        "trace-circuit-open-2",
      );
      await client.composeConversationResponse(
        { userMessage: "Third should short-circuit" },
        "trace-circuit-open-3",
      );

      const local = client.getBudgetGuardrailState();
      expect(local.circuitOpen).toBe(true);
      expect(local.state.consecutiveFailures).toBeGreaterThanOrEqual(2);

      const global = getOpenAIBudgetGuardrailSnapshot();
      expect(global.anyCircuitOpen).toBe(true);
      expect(global.openCircuitCount).toBeGreaterThanOrEqual(1);
    } finally {
      if (previousThreshold === undefined) {
        delete process.env.OPENAI_BUDGET_CIRCUIT_FAILURE_THRESHOLD;
      } else {
        process.env.OPENAI_BUDGET_CIRCUIT_FAILURE_THRESHOLD = previousThreshold;
      }
      if (previousCooldown === undefined) {
        delete process.env.OPENAI_BUDGET_CIRCUIT_COOLDOWN_MS;
      } else {
        process.env.OPENAI_BUDGET_CIRCUIT_COOLDOWN_MS = previousCooldown;
      }
    }
  });

  it("returns null and captures timeout failures for onboarding inference", async () => {
    const failureStore = new OpenAIFailureStore();
    vi.mocked(run).mockRejectedValueOnce(new Error("request timeout exceeded"));

    const client = new OpenAIClient({
      apiKey: "enabled",
      defaultModel: "gpt-4.1-mini",
      failureStore,
    });

    const result = await client.inferOnboarding(
      "I want thoughtful people to make plans with.",
      "trace-onboarding-timeout-1",
    );

    expect(result).toBeNull();
    const failures = client.listCapturedFailures("onboarding_inference");
    expect(failures).toHaveLength(1);
    expect(failures[0]?.reason).toBe("request_failed");
    expect(String(failures[0]?.errorMessage).toLowerCase()).toContain(
      "timeout",
    );
  });
});
