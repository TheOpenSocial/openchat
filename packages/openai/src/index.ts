import {
  IntentType,
  IntentUrgency,
  intentPayloadSchema,
  onboardingInferResponseSchema,
} from "@opensocial/types";
import { SpanStatusCode, context, trace } from "@opentelemetry/api";
import OpenAI from "openai";
import { z } from "zod";
export * from "./agents.js";
export * from "./failure-replay.js";
export * from "./golden-intent-dataset.js";
export {
  getPromptDefinition,
  getPromptVersion,
  openAIRoutingTasks,
} from "./prompts.js";
import {
  OpenAIFailureStore,
  type OpenAIFailureRecord,
} from "./failure-replay.js";
import {
  getPromptDefinition,
  openAIRoutingTasks,
  type OpenAIRoutingTask,
} from "./prompts.js";
import {
  agentTools,
  openAIAgentRoles,
  type OpenAIAgentRole,
} from "./agents.js";

export const parsedIntentSchema = intentPayloadSchema.extend({
  intentType: z.nativeEnum(IntentType),
  urgency: z.nativeEnum(IntentUrgency),
  requiresFollowUp: z.boolean().default(false),
  followUpQuestion: z.string().optional(),
});

export const suggestionSchema = z.object({
  title: z.string().min(1),
  message: z.string().min(1),
  reason: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export const suggestionsResponseSchema = z.object({
  suggestions: z.array(suggestionSchema).min(1).max(5),
});

export const rankingExplanationSchema = z.object({
  candidateUserId: z.string().min(1),
  score: z.number().min(0).max(1),
  blockedByPolicy: z.boolean().default(false),
  reasons: z.array(z.string().min(1)).min(1),
});

export const moderationAssistSchema = z.object({
  decision: z.enum(["clean", "review", "blocked"]),
  reason: z.string().min(1).max(500).optional(),
});

export const conversationToolCallSchema = z.object({
  role: z.enum(openAIAgentRoles),
  tool: z.enum(agentTools),
  input: z.record(z.string(), z.unknown()).default({}),
});

export const conversationPlanSchema = z.object({
  specialists: z
    .array(z.enum(openAIAgentRoles))
    .max(5)
    .default(["intent_parser"]),
  toolCalls: z.array(conversationToolCallSchema).max(10).default([]),
  responseGoal: z.string().min(1).max(500).optional(),
});

export type ParsedIntent = z.infer<typeof parsedIntentSchema>;
export type Suggestion = z.infer<typeof suggestionSchema>;
export type RankingExplanation = z.infer<typeof rankingExplanationSchema>;
export type ModerationAssistResult = z.infer<typeof moderationAssistSchema>;
export type ConversationPlan = z.infer<typeof conversationPlanSchema>;
export type ParsedOnboardingInference = z.infer<
  typeof onboardingInferResponseSchema
>;

export interface OpenAIClientOptions {
  apiKey: string;
  defaultModel?: string;
  timeoutMs?: number;
  maxRetries?: number;
  modelRouting?: Partial<Record<OpenAIRoutingTask, string>>;
  failureStore?: OpenAIFailureStore;
}

interface OpenAIBudgetPolicy {
  maxResponseChars: number;
  maxEstimatedCostUsdPerResponse: number;
  inputCostPer1KTokensUsd: number;
  outputCostPer1KTokensUsd: number;
  circuitFailureThreshold: number;
  circuitCooldownMs: number;
}

interface OpenAIBudgetRuntimeState {
  consecutiveFailures: number;
  circuitOpenedAt: number | null;
  lastFailureAt: number | null;
  lastFailureReason: string | null;
}

export interface OpenAIBudgetGuardrailSnapshot {
  instanceId: string;
  circuitOpen: boolean;
  policy: OpenAIBudgetPolicy;
  state: {
    consecutiveFailures: number;
    circuitOpenedAt: string | null;
    lastFailureAt: string | null;
    lastFailureReason: string | null;
  };
  updatedAt: string;
}

const openAIBudgetRegistry = new Map<string, OpenAIBudgetGuardrailSnapshot>();
let openAIClientInstanceCounter = 0;

const DEFAULT_MODEL_BY_TASK: Record<OpenAIRoutingTask, string> = {
  intent_parsing: "gpt-4.1-mini",
  onboarding_inference: "gpt-4.1-mini",
  follow_up_question: "gpt-4.1-mini",
  suggestion_generation: "gpt-4.1-mini",
  ranking_explanation: "gpt-4.1-mini",
  notification_copy: "gpt-4.1-mini",
  moderation_assist: "gpt-4.1-mini",
  conversation_planning: "gpt-4.1-mini",
  conversation_response: "gpt-4.1-mini",
};

export function getOpenAIBudgetGuardrailSnapshot() {
  const clients = Array.from(openAIBudgetRegistry.values());
  const openCircuitCount = clients.filter((entry) => entry.circuitOpen).length;
  return {
    generatedAt: new Date().toISOString(),
    clientCount: clients.length,
    openCircuitCount,
    anyCircuitOpen: openCircuitCount > 0,
    clients,
  };
}

export class OpenAIClient {
  private readonly client: OpenAI;
  private readonly modelRouting: Record<OpenAIRoutingTask, string>;
  private readonly apiEnabled: boolean;
  private readonly failureStore: OpenAIFailureStore;
  private readonly tracer = trace.getTracer("@opensocial/openai");
  private readonly instanceId: string;
  private readonly budgetPolicy: OpenAIBudgetPolicy;
  private readonly budgetRuntime: OpenAIBudgetRuntimeState = {
    consecutiveFailures: 0,
    circuitOpenedAt: null,
    lastFailureAt: null,
    lastFailureReason: null,
  };

  constructor(options: OpenAIClientOptions) {
    this.client = new OpenAI({
      apiKey: options.apiKey,
      timeout: options.timeoutMs ?? 15_000,
      maxRetries: options.maxRetries ?? 3,
    });

    const globalFallbackModel =
      options.defaultModel ?? process.env.OPENAI_DEFAULT_MODEL;

    this.modelRouting = openAIRoutingTasks.reduce(
      (acc, task) => {
        const envModel = process.env[`OPENAI_MODEL_${task.toUpperCase()}`];
        acc[task] =
          options.modelRouting?.[task] ??
          envModel ??
          globalFallbackModel ??
          DEFAULT_MODEL_BY_TASK[task];
        return acc;
      },
      {} as Record<OpenAIRoutingTask, string>,
    );

    this.apiEnabled = Boolean(options.apiKey);
    this.failureStore = options.failureStore ?? new OpenAIFailureStore();
    this.instanceId = `openai-client-${++openAIClientInstanceCounter}`;
    this.budgetPolicy = {
      maxResponseChars: this.readNumberEnv(
        "OPENAI_RESPONSE_MAX_OUTPUT_CHARS",
        2_000,
        200,
        20_000,
      ),
      maxEstimatedCostUsdPerResponse: this.readNumberEnv(
        "OPENAI_BUDGET_MAX_ESTIMATED_COST_USD_PER_RESPONSE",
        0.12,
        0.005,
        5,
      ),
      inputCostPer1KTokensUsd: this.readNumberEnv(
        "OPENAI_ESTIMATED_INPUT_COST_PER_1K_TOKENS_USD",
        0.003,
        0.000001,
        5,
      ),
      outputCostPer1KTokensUsd: this.readNumberEnv(
        "OPENAI_ESTIMATED_OUTPUT_COST_PER_1K_TOKENS_USD",
        0.01,
        0.000001,
        10,
      ),
      circuitFailureThreshold: Math.trunc(
        this.readNumberEnv("OPENAI_BUDGET_CIRCUIT_FAILURE_THRESHOLD", 3, 1, 20),
      ),
      circuitCooldownMs: Math.trunc(
        this.readNumberEnv(
          "OPENAI_BUDGET_CIRCUIT_COOLDOWN_MS",
          60_000,
          5_000,
          60 * 60 * 1000,
        ),
      ),
    };
    this.syncBudgetRegistry("initialized");
  }

  getModelForTask(task: OpenAIRoutingTask) {
    return this.modelRouting[task];
  }

  getModelPolicy() {
    return { ...this.modelRouting };
  }

  getPromptVersion(task: OpenAIRoutingTask) {
    return getPromptDefinition(task).version;
  }

  getBudgetGuardrailState(): OpenAIBudgetGuardrailSnapshot {
    return this.toBudgetSnapshot();
  }

  createTraceMetadata(
    traceId: string,
    task: OpenAIRoutingTask,
    extra: Record<string, string | number | boolean | null | undefined> = {},
  ) {
    const activeSpan = trace.getSpan(context.active());
    const activeSpanContext = activeSpan?.spanContext();
    return Object.entries({
      traceId,
      appTraceId: traceId,
      correlationId: traceId,
      task,
      otelTraceId: activeSpanContext?.traceId,
      otelSpanId: activeSpanContext?.spanId,
      ...extra,
    }).reduce(
      (acc, [key, value]) => {
        if (value !== undefined && value !== null) {
          acc[key] = String(value);
        }
        return acc;
      },
      {} as Record<string, string>,
    );
  }

  listCapturedFailures(task?: OpenAIRoutingTask): OpenAIFailureRecord[] {
    return this.failureStore.listFailures(task);
  }

  async replayCapturedFailure(
    failureId: string,
    replayTraceId = `replay-${Date.now()}`,
  ) {
    const failure = this.failureStore.markReplayed(failureId);
    if (!failure) {
      return { status: "not_found" as const };
    }

    if (failure.task === "intent_parsing") {
      if (typeof failure.inputPayload !== "string") {
        return { status: "invalid_payload" as const, failure };
      }
      return {
        status: "replayed" as const,
        failure,
        result: await this.parseIntent(failure.inputPayload, replayTraceId),
      };
    }

    if (failure.task === "suggestion_generation") {
      const payload =
        typeof failure.inputPayload === "object" && failure.inputPayload
          ? (failure.inputPayload as {
              intentText?: string;
              maxSuggestions?: number;
            })
          : null;
      if (!payload?.intentText) {
        return { status: "invalid_payload" as const, failure };
      }
      return {
        status: "replayed" as const,
        failure,
        result: await this.generateSuggestions(
          {
            intentText: payload.intentText,
            maxSuggestions: payload.maxSuggestions,
          },
          replayTraceId,
        ),
      };
    }

    if (failure.task === "ranking_explanation") {
      const payload =
        typeof failure.inputPayload === "object" && failure.inputPayload
          ? (failure.inputPayload as {
              candidateUserId?: string;
              score?: number;
              features?: Record<string, string | number | boolean>;
              blockedByPolicy?: boolean;
            })
          : null;
      if (
        !payload?.candidateUserId ||
        typeof payload.score !== "number" ||
        !payload.features
      ) {
        return { status: "invalid_payload" as const, failure };
      }
      return {
        status: "replayed" as const,
        failure,
        result: await this.explainRanking(
          {
            candidateUserId: payload.candidateUserId,
            score: payload.score,
            features: payload.features,
            blockedByPolicy: payload.blockedByPolicy,
          },
          replayTraceId,
        ),
      };
    }

    return { status: "unsupported_task" as const, failure };
  }

  async parseIntent(rawText: string, traceId: string): Promise<ParsedIntent> {
    return this.runWithOpenAISpan("intent_parsing", traceId, async () => {
      if (this.detectPromptInjection(rawText)) {
        this.captureFailure({
          task: "intent_parsing",
          traceId,
          model: this.getModelForTask("intent_parsing"),
          promptVersion: getPromptDefinition("intent_parsing").version,
          reason: "prompt_injection_detected",
          inputPayload: rawText,
        });
        return this.fallbackParseIntent(rawText);
      }

      if (!this.isAiParsingEnabled()) {
        this.captureFailure({
          task: "intent_parsing",
          traceId,
          model: this.getModelForTask("intent_parsing"),
          promptVersion: getPromptDefinition("intent_parsing").version,
          reason: "ai_parsing_disabled",
          inputPayload: rawText,
        });
        return this.fallbackParseIntent(rawText);
      }

      if (!this.apiEnabled) {
        return this.fallbackParseIntent(rawText);
      }
      const prompt = getPromptDefinition("intent_parsing");
      const model = this.getModelForTask("intent_parsing");

      try {
        const response = await this.client.responses.create({
          model,
          instructions: prompt.instructions,
          input: rawText,
          metadata: this.createTraceMetadata(traceId, "intent_parsing", {
            feature: "intent_parsing",
            promptVersion: prompt.version,
          }),
        });

        const text = response.output_text?.trim();
        if (!text) {
          this.captureFailure({
            task: "intent_parsing",
            traceId,
            model,
            promptVersion: prompt.version,
            reason: "empty_output",
            inputPayload: rawText,
          });
          return this.fallbackParseIntent(rawText);
        }

        try {
          return parsedIntentSchema.parse(JSON.parse(text));
        } catch (error) {
          this.captureFailure({
            task: "intent_parsing",
            traceId,
            model,
            promptVersion: prompt.version,
            reason: "schema_parse_failed",
            inputPayload: rawText,
            responseText: text,
            errorMessage:
              error instanceof Error ? error.message : "parse_error",
          });
          return this.fallbackParseIntent(rawText);
        }
      } catch (error) {
        this.captureFailure({
          task: "intent_parsing",
          traceId,
          model,
          promptVersion: prompt.version,
          reason: "request_failed",
          inputPayload: rawText,
          errorMessage:
            error instanceof Error ? error.message : "request_failed_unknown",
        });
        return this.fallbackParseIntent(rawText);
      }
    });
  }

  async inferOnboarding(
    rawText: string,
    traceId: string,
  ): Promise<ParsedOnboardingInference | null> {
    return this.runWithOpenAISpan("onboarding_inference", traceId, async () => {
      const startedAt = Date.now();
      if (this.detectPromptInjection(rawText)) {
        console.warn(
          `[openai:onboarding] prompt injection detected traceId=${traceId} durationMs=${Date.now() - startedAt}`,
        );
        this.captureFailure({
          task: "onboarding_inference",
          traceId,
          model: this.getModelForTask("onboarding_inference"),
          promptVersion: getPromptDefinition("onboarding_inference").version,
          reason: "prompt_injection_detected",
          inputPayload: rawText,
        });
        return null;
      }

      if (!this.apiEnabled) {
        console.warn(
          `[openai:onboarding] api disabled traceId=${traceId} durationMs=${Date.now() - startedAt}`,
        );
        return null;
      }

      const prompt = getPromptDefinition("onboarding_inference");
      const model = this.getModelForTask("onboarding_inference");

      try {
        const response = await this.client.responses.create({
          model,
          instructions: prompt.instructions,
          input: rawText,
          metadata: this.createTraceMetadata(traceId, "onboarding_inference", {
            feature: "onboarding_inference",
            promptVersion: prompt.version,
          }),
        });

        const text = response.output_text?.trim();
        if (!text) {
          console.warn(
            `[openai:onboarding] empty output traceId=${traceId} model=${model} durationMs=${Date.now() - startedAt}`,
          );
          this.captureFailure({
            task: "onboarding_inference",
            traceId,
            model,
            promptVersion: prompt.version,
            reason: "empty_output",
            inputPayload: rawText,
          });
          return null;
        }

        try {
          const parsed = onboardingInferResponseSchema.parse(JSON.parse(text));
          console.log(
            `[openai:onboarding] success traceId=${traceId} model=${model} durationMs=${Date.now() - startedAt} hasPersona=${Boolean(parsed.persona)} hasFollowUp=${Boolean(parsed.followUpQuestion?.trim())}`,
          );
          return parsed;
        } catch (error) {
          console.warn(
            `[openai:onboarding] schema parse failed traceId=${traceId} model=${model} durationMs=${Date.now() - startedAt} error=${error instanceof Error ? error.message : "parse_error"}`,
          );
          this.captureFailure({
            task: "onboarding_inference",
            traceId,
            model,
            promptVersion: prompt.version,
            reason: "schema_parse_failed",
            inputPayload: rawText,
            responseText: text,
            errorMessage:
              error instanceof Error ? error.message : "parse_error",
          });
          return null;
        }
      } catch (error) {
        console.error(
          `[openai:onboarding] request failed traceId=${traceId} model=${model} durationMs=${Date.now() - startedAt} error=${error instanceof Error ? error.message : "request_failed_unknown"}`,
        );
        this.captureFailure({
          task: "onboarding_inference",
          traceId,
          model,
          promptVersion: prompt.version,
          reason: "request_failed",
          inputPayload: rawText,
          errorMessage:
            error instanceof Error ? error.message : "request_failed_unknown",
        });
        return null;
      }
    });
  }

  async generateSuggestions(
    input: {
      intentText: string;
      maxSuggestions?: number;
    },
    traceId: string,
  ): Promise<Suggestion[]> {
    return this.runWithOpenAISpan(
      "suggestion_generation",
      traceId,
      async () => {
        if (this.detectPromptInjection(input.intentText)) {
          this.captureFailure({
            task: "suggestion_generation",
            traceId,
            model: this.getModelForTask("suggestion_generation"),
            promptVersion: getPromptDefinition("suggestion_generation").version,
            reason: "prompt_injection_detected",
            inputPayload: input,
          });
          return this.fallbackSuggestions(input.intentText).slice(
            0,
            input.maxSuggestions ?? 3,
          );
        }

        if (!this.apiEnabled) {
          return this.fallbackSuggestions(input.intentText).slice(
            0,
            input.maxSuggestions ?? 3,
          );
        }
        const prompt = getPromptDefinition("suggestion_generation");
        const model = this.getModelForTask("suggestion_generation");

        try {
          const response = await this.client.responses.create({
            model,
            instructions: prompt.instructions,
            input: input.intentText,
            metadata: this.createTraceMetadata(
              traceId,
              "suggestion_generation",
              {
                feature: "suggestion_generation",
                promptVersion: prompt.version,
              },
            ),
          });

          const text = response.output_text?.trim();
          if (!text) {
            this.captureFailure({
              task: "suggestion_generation",
              traceId,
              model,
              promptVersion: prompt.version,
              reason: "empty_output",
              inputPayload: input,
            });
            return this.fallbackSuggestions(input.intentText).slice(
              0,
              input.maxSuggestions ?? 3,
            );
          }

          try {
            const parsed = suggestionsResponseSchema.parse(JSON.parse(text));
            return parsed.suggestions.slice(0, input.maxSuggestions ?? 3);
          } catch (error) {
            this.captureFailure({
              task: "suggestion_generation",
              traceId,
              model,
              promptVersion: prompt.version,
              reason: "schema_parse_failed",
              inputPayload: input,
              responseText: text,
              errorMessage:
                error instanceof Error ? error.message : "parse_error",
            });
            return this.fallbackSuggestions(input.intentText).slice(
              0,
              input.maxSuggestions ?? 3,
            );
          }
        } catch (error) {
          this.captureFailure({
            task: "suggestion_generation",
            traceId,
            model,
            promptVersion: prompt.version,
            reason: "request_failed",
            inputPayload: input,
            errorMessage:
              error instanceof Error ? error.message : "request_failed_unknown",
          });
          return this.fallbackSuggestions(input.intentText).slice(
            0,
            input.maxSuggestions ?? 3,
          );
        }
      },
    );
  }

  async explainRanking(
    input: {
      candidateUserId: string;
      score: number;
      features: Record<string, string | number | boolean>;
      blockedByPolicy?: boolean;
    },
    traceId: string,
  ): Promise<RankingExplanation> {
    return this.runWithOpenAISpan("ranking_explanation", traceId, async () => {
      if (this.detectPromptInjection(JSON.stringify(input))) {
        this.captureFailure({
          task: "ranking_explanation",
          traceId,
          model: this.getModelForTask("ranking_explanation"),
          promptVersion: getPromptDefinition("ranking_explanation").version,
          reason: "prompt_injection_detected",
          inputPayload: input,
        });
        return this.fallbackRankingExplanation(input);
      }

      if (!this.apiEnabled) {
        return this.fallbackRankingExplanation(input);
      }
      const prompt = getPromptDefinition("ranking_explanation");
      const model = this.getModelForTask("ranking_explanation");

      try {
        const response = await this.client.responses.create({
          model,
          instructions: prompt.instructions,
          input: JSON.stringify(input),
          metadata: this.createTraceMetadata(traceId, "ranking_explanation", {
            feature: "ranking_explanation",
            promptVersion: prompt.version,
          }),
        });

        const text = response.output_text?.trim();
        if (!text) {
          this.captureFailure({
            task: "ranking_explanation",
            traceId,
            model,
            promptVersion: prompt.version,
            reason: "empty_output",
            inputPayload: input,
          });
          return this.fallbackRankingExplanation(input);
        }

        try {
          return rankingExplanationSchema.parse(JSON.parse(text));
        } catch (error) {
          this.captureFailure({
            task: "ranking_explanation",
            traceId,
            model,
            promptVersion: prompt.version,
            reason: "schema_parse_failed",
            inputPayload: input,
            responseText: text,
            errorMessage:
              error instanceof Error ? error.message : "parse_error",
          });
          return this.fallbackRankingExplanation(input);
        }
      } catch (error) {
        this.captureFailure({
          task: "ranking_explanation",
          traceId,
          model,
          promptVersion: prompt.version,
          reason: "request_failed",
          inputPayload: input,
          errorMessage:
            error instanceof Error ? error.message : "request_failed_unknown",
        });
        return this.fallbackRankingExplanation(input);
      }
    });
  }

  async planConversationTurn(
    input: {
      userMessage: string;
      threadSummary?: string;
      socialContext?: Record<string, unknown>;
      multimodalContext?: Record<string, unknown>;
      allowedSpecialists?: OpenAIAgentRole[];
      maxToolCalls?: number;
    },
    traceId: string,
  ): Promise<ConversationPlan> {
    return this.runWithOpenAISpan(
      "conversation_planning",
      traceId,
      async () => {
        const prompt = getPromptDefinition("conversation_planning");
        const model = this.getModelForTask("conversation_planning");
        const fallback = this.sanitizeConversationPlan(
          this.fallbackConversationPlan(input.userMessage),
          input.allowedSpecialists,
          input.maxToolCalls,
        );

        if (this.detectPromptInjection(input.userMessage)) {
          this.captureFailure({
            task: "conversation_planning",
            traceId,
            model,
            promptVersion: prompt.version,
            reason: "prompt_injection_detected",
            inputPayload: input,
          });
          return fallback;
        }

        if (!this.apiEnabled) {
          return fallback;
        }

        try {
          const response = await this.client.responses.create({
            model,
            instructions: prompt.instructions,
            input: JSON.stringify(input),
            metadata: this.createTraceMetadata(
              traceId,
              "conversation_planning",
              {
                feature: "conversation_planning",
                promptVersion: prompt.version,
              },
            ),
          });

          const text = response.output_text?.trim();
          if (!text) {
            this.captureFailure({
              task: "conversation_planning",
              traceId,
              model,
              promptVersion: prompt.version,
              reason: "empty_output",
              inputPayload: input,
            });
            return fallback;
          }

          try {
            const parsed = conversationPlanSchema.parse(JSON.parse(text));
            return this.sanitizeConversationPlan(
              parsed,
              input.allowedSpecialists,
              input.maxToolCalls,
            );
          } catch (error) {
            this.captureFailure({
              task: "conversation_planning",
              traceId,
              model,
              promptVersion: prompt.version,
              reason: "schema_parse_failed",
              inputPayload: input,
              responseText: text,
              errorMessage:
                error instanceof Error ? error.message : "parse_error",
            });
            return fallback;
          }
        } catch (error) {
          this.captureFailure({
            task: "conversation_planning",
            traceId,
            model,
            promptVersion: prompt.version,
            reason: "request_failed",
            inputPayload: input,
            errorMessage:
              error instanceof Error ? error.message : "request_failed_unknown",
          });
          return fallback;
        }
      },
    );
  }

  async composeConversationResponse(
    input: {
      userMessage: string;
      responseGoal?: string;
      socialContext?: Record<string, unknown>;
      multimodalContext?: Record<string, unknown>;
      specialistOutputs?: Record<string, unknown>;
      toolOutputs?: Record<string, unknown>;
    },
    traceId: string,
    options?: {
      onTextDelta?: (delta: string) => Promise<void> | void;
    },
  ): Promise<string> {
    return this.runWithOpenAISpan(
      "conversation_response",
      traceId,
      async () => {
        const prompt = getPromptDefinition("conversation_response");
        const model = this.getModelForTask("conversation_response");
        const fallback = this.fallbackConversationResponse(input);

        if (this.detectPromptInjection(input.userMessage)) {
          this.captureFailure({
            task: "conversation_response",
            traceId,
            model,
            promptVersion: prompt.version,
            reason: "prompt_injection_detected",
            inputPayload: input,
          });
          return fallback;
        }

        if (this.isCircuitOpen()) {
          this.captureFailure({
            task: "conversation_response",
            traceId,
            model,
            promptVersion: prompt.version,
            reason: "circuit_open",
            inputPayload: input,
          });
          return fallback;
        }

        const estimatedCost = this.estimateConversationResponseCostUsd(
          input,
          this.budgetPolicy.maxResponseChars,
        );
        if (estimatedCost > this.budgetPolicy.maxEstimatedCostUsdPerResponse) {
          this.captureFailure({
            task: "conversation_response",
            traceId,
            model,
            promptVersion: prompt.version,
            reason: "budget_guardrail_exceeded",
            inputPayload: {
              ...input,
              estimatedCostUsd: estimatedCost,
              budgetCapUsd: this.budgetPolicy.maxEstimatedCostUsdPerResponse,
            },
          });
          this.syncBudgetRegistry("budget_guardrail_exceeded");
          return fallback;
        }

        if (!this.apiEnabled) {
          return fallback;
        }

        try {
          const requestPayload = JSON.stringify(input);
          const metadata = this.createTraceMetadata(
            traceId,
            "conversation_response",
            {
              feature: "conversation_response",
              promptVersion: prompt.version,
            },
          );
          const text = options?.onTextDelta
            ? await this.streamConversationResponse({
                model,
                instructions: prompt.instructions,
                payload: requestPayload,
                metadata,
                onTextDelta: options.onTextDelta,
              })
            : (
                await this.client.responses.create({
                  model,
                  instructions: prompt.instructions,
                  input: requestPayload,
                  metadata,
                })
              ).output_text?.trim();

          const boundedText = this.applyResponseLengthBudget(text ?? "");
          if (!boundedText) {
            this.captureFailure({
              task: "conversation_response",
              traceId,
              model,
              promptVersion: prompt.version,
              reason: "empty_output",
              inputPayload: input,
            });
            this.registerOpenAIFailure("empty_output");
            return fallback;
          }

          this.registerOpenAISuccess();
          this.syncBudgetRegistry("request_succeeded");
          return boundedText;
        } catch (error) {
          this.captureFailure({
            task: "conversation_response",
            traceId,
            model,
            promptVersion: prompt.version,
            reason: "request_failed",
            inputPayload: input,
            errorMessage:
              error instanceof Error ? error.message : "request_failed_unknown",
          });
          this.registerOpenAIFailure(
            error instanceof Error ? error.message : "request_failed_unknown",
          );
          return fallback;
        }
      },
    );
  }

  async assistModeration(
    input: {
      content: string;
      context?: string;
    },
    traceId: string,
  ): Promise<ModerationAssistResult> {
    return this.runWithOpenAISpan("moderation_assist", traceId, async () => {
      const prompt = getPromptDefinition("moderation_assist");
      const model = this.getModelForTask("moderation_assist");
      const fallback = this.fallbackModerationAssist(input.content);

      if (this.detectPromptInjection(input.content)) {
        this.captureFailure({
          task: "moderation_assist",
          traceId,
          model,
          promptVersion: prompt.version,
          reason: "prompt_injection_detected",
          inputPayload: input,
        });
        return fallback;
      }

      if (!this.apiEnabled) {
        return fallback;
      }

      try {
        const response = await this.client.responses.create({
          model,
          instructions: prompt.instructions,
          input: JSON.stringify(input),
          metadata: this.createTraceMetadata(traceId, "moderation_assist", {
            feature: "moderation_assist",
            promptVersion: prompt.version,
          }),
        });
        const text = response.output_text?.trim();
        if (!text) {
          this.captureFailure({
            task: "moderation_assist",
            traceId,
            model,
            promptVersion: prompt.version,
            reason: "empty_output",
            inputPayload: input,
          });
          return fallback;
        }
        try {
          return moderationAssistSchema.parse(JSON.parse(text));
        } catch (error) {
          this.captureFailure({
            task: "moderation_assist",
            traceId,
            model,
            promptVersion: prompt.version,
            reason: "schema_parse_failed",
            inputPayload: input,
            responseText: text,
            errorMessage:
              error instanceof Error ? error.message : "parse_error",
          });
          return fallback;
        }
      } catch (error) {
        this.captureFailure({
          task: "moderation_assist",
          traceId,
          model,
          promptVersion: prompt.version,
          reason: "request_failed",
          inputPayload: input,
          errorMessage:
            error instanceof Error ? error.message : "request_failed_unknown",
        });
        return fallback;
      }
    });
  }

  async composeNotificationCopy(
    input: {
      intentText: string;
      tone?: "neutral" | "friendly" | "urgent";
      maxLength?: number;
    },
    traceId: string,
  ): Promise<string> {
    return this.runWithOpenAISpan("notification_copy", traceId, async () => {
      const prompt = getPromptDefinition("notification_copy");
      const model = this.getModelForTask("notification_copy");
      const fallback = this.fallbackNotificationCopy(input.intentText);

      if (this.detectPromptInjection(input.intentText)) {
        this.captureFailure({
          task: "notification_copy",
          traceId,
          model,
          promptVersion: prompt.version,
          reason: "prompt_injection_detected",
          inputPayload: input,
        });
        return fallback;
      }

      if (!this.apiEnabled) {
        return fallback;
      }

      try {
        const response = await this.client.responses.create({
          model,
          instructions: prompt.instructions,
          input: JSON.stringify(input),
          metadata: this.createTraceMetadata(traceId, "notification_copy", {
            feature: "notification_copy",
            promptVersion: prompt.version,
          }),
        });
        const text = response.output_text?.trim();
        if (!text) {
          this.captureFailure({
            task: "notification_copy",
            traceId,
            model,
            promptVersion: prompt.version,
            reason: "empty_output",
            inputPayload: input,
          });
          return fallback;
        }
        return text.slice(0, input.maxLength ?? 220);
      } catch (error) {
        this.captureFailure({
          task: "notification_copy",
          traceId,
          model,
          promptVersion: prompt.version,
          reason: "request_failed",
          inputPayload: input,
          errorMessage:
            error instanceof Error ? error.message : "request_failed_unknown",
        });
        return fallback;
      }
    });
  }

  private async runWithOpenAISpan<T>(
    task: OpenAIRoutingTask,
    traceId: string,
    fn: () => Promise<T>,
  ) {
    const span = this.tracer.startSpan(`openai.${task}`);
    span.setAttribute("openai.task", task);
    span.setAttribute("app.trace_id", traceId);

    try {
      const result = await context.with(
        trace.setSpan(context.active(), span),
        fn,
      );
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : "unknown_error",
      });
      throw error;
    } finally {
      span.end();
    }
  }

  private captureFailure(
    failure: Omit<OpenAIFailureRecord, "id" | "occurredAt" | "replayCount">,
  ) {
    this.failureStore.captureFailure(failure);
  }

  private fallbackParseIntent(rawText: string): ParsedIntent {
    const lower = rawText.toLowerCase();
    const isGroup = /\b(group|team|people|need\s+\d+)\b/.test(lower);
    const isActivity = /\b(play|go|meet|find)\b/.test(lower);
    const extractedGroupSize =
      Number(
        lower.match(/\b(?:group(?:\s+of)?\s*|need\s+)([2-4])\b/)?.[1] ??
          lower.match(/\b([2-4])\s*(people|players|friends|person)\b/)?.[1] ??
          0,
      ) || undefined;
    const topics = this.extractMatches(lower, [
      "tennis",
      "apex",
      "valorant",
      "football",
      "basketball",
      "react",
      "typescript",
      "ai",
      "startup",
    ]);
    const activities = this.extractMatches(lower, [
      "chat",
      "play",
      "study",
      "code",
      "walk",
      "coffee",
      "gym",
      "hike",
      "meet",
    ]);
    const timingConstraints = this.extractMatches(lower, [
      "now",
      "asap",
      "today",
      "tonight",
      "tomorrow",
      "weekend",
      "morning",
      "afternoon",
      "evening",
      "after work",
    ]);
    const skillConstraints = this.extractMatches(lower, [
      "beginner",
      "intermediate",
      "advanced",
      "pro",
      "casual",
    ]);
    const vibeConstraints = this.extractMatches(lower, [
      "chill",
      "competitive",
      "serious",
      "friendly",
      "high energy",
      "low pressure",
    ]);
    const modality =
      lower.includes("online") || lower.includes("discord")
        ? "online"
        : lower.includes("offline") ||
            lower.includes("in person") ||
            lower.includes("near me") ||
            lower.includes("park") ||
            lower.includes("cafe")
          ? "offline"
          : undefined;

    return parsedIntentSchema.parse({
      version: 1,
      rawText,
      intentType: isGroup
        ? IntentType.GROUP
        : isActivity
          ? IntentType.ACTIVITY
          : IntentType.CHAT,
      urgency: /\bnow|asap\b/.test(lower)
        ? IntentUrgency.NOW
        : IntentUrgency.FLEXIBLE,
      modality,
      topics,
      activities,
      groupSizeTarget: extractedGroupSize,
      timingConstraints,
      skillConstraints,
      vibeConstraints,
      confidence: 0.45,
      requiresFollowUp: true,
      followUpQuestion:
        "Can you share your preferred time and whether you want 1:1 or group?",
    });
  }

  private extractMatches(text: string, dictionary: string[]) {
    return dictionary.filter((token) =>
      new RegExp(`\\b${token.replace(/\s+/g, "\\s+")}\\b`, "i").test(text),
    );
  }

  private fallbackSuggestions(intentText: string): Suggestion[] {
    return suggestionsResponseSchema.parse({
      suggestions: [
        {
          title: "Tighten your intent",
          message: "Add when you're available and if you prefer 1:1 or group.",
          reason: "Clear constraints improve match quality and speed.",
          confidence: 0.72,
        },
        {
          title: "Add topic detail",
          message: `Mention your specific angle (e.g. beginner, advanced) for: ${intentText.slice(0, 40)}`,
          reason: "Specificity helps ranking and response quality.",
          confidence: 0.64,
        },
      ],
    }).suggestions;
  }

  private fallbackRankingExplanation(input: {
    candidateUserId: string;
    score: number;
    features: Record<string, string | number | boolean>;
    blockedByPolicy?: boolean;
  }): RankingExplanation {
    const topFeatures = Object.entries(input.features)
      .slice(0, 3)
      .map(([key, value]) => `${key}: ${String(value)}`);

    return rankingExplanationSchema.parse({
      candidateUserId: input.candidateUserId,
      score: Math.min(Math.max(input.score, 0), 1),
      blockedByPolicy: input.blockedByPolicy ?? false,
      reasons:
        topFeatures.length > 0
          ? topFeatures
          : ["Fallback explanation: insufficient feature detail"],
    });
  }

  private sanitizeConversationPlan(
    plan: ConversationPlan,
    allowedSpecialists?: OpenAIAgentRole[],
    maxToolCalls?: number,
  ): ConversationPlan {
    const allowedSpecialistSet =
      allowedSpecialists && allowedSpecialists.length > 0
        ? new Set(allowedSpecialists)
        : null;

    const specialists = plan.specialists.filter(
      (specialist: OpenAIAgentRole) =>
        allowedSpecialistSet ? allowedSpecialistSet.has(specialist) : true,
    );

    return conversationPlanSchema.parse({
      specialists: specialists.length > 0 ? specialists : ["intent_parser"],
      toolCalls: plan.toolCalls.slice(
        0,
        Math.max(0, Math.min(maxToolCalls ?? 6, 10)),
      ),
      responseGoal: plan.responseGoal,
    });
  }

  private fallbackConversationPlan(userMessage: string): ConversationPlan {
    const normalized = userMessage.toLowerCase();
    const looksLikeReminder =
      normalized.includes("remind me") ||
      normalized.includes("follow up") ||
      normalized.includes("check back");
    const looksLikeSearch =
      normalized.includes("meet") ||
      normalized.includes("find") ||
      normalized.includes("talk") ||
      normalized.includes("play") ||
      normalized.includes("looking for");
    const looksTimeSensitive =
      normalized.includes("now") ||
      normalized.includes("tonight") ||
      normalized.includes("today") ||
      normalized.includes("active") ||
      normalized.includes("available");
    const looksLikeGroup =
      normalized.includes("group") ||
      normalized.includes("small group") ||
      normalized.includes("circle") ||
      normalized.includes("people to join");
    const looksLikeCircleCreation =
      normalized.includes("create a circle") ||
      normalized.includes("start a circle") ||
      normalized.includes("make a circle") ||
      normalized.includes("host a group");
    const looksLikeCircleJoin =
      normalized.includes("join a circle") ||
      normalized.includes("join this circle") ||
      normalized.includes("add me to the circle");
    const looksLikeIntroAcceptance =
      normalized.includes("accept that intro") ||
      normalized.includes("accept the intro") ||
      normalized.includes("say yes to that request");
    const looksLikeIntroRejection =
      normalized.includes("reject that intro") ||
      normalized.includes("decline the intro") ||
      normalized.includes("say no to that request");
    const looksLikeIntroRetraction =
      normalized.includes("cancel that intro") ||
      normalized.includes("retract that intro") ||
      normalized.includes("pull back that request");
    const looksLikeScarcity =
      normalized.includes("nobody") ||
      normalized.includes("no one") ||
      normalized.includes("noone") ||
      normalized.includes("nothing yet") ||
      normalized.includes("not finding anyone") ||
      normalized.includes("no matches");
    const looksLikePreferenceUpdate =
      normalized.includes("remember that") ||
      normalized.includes("i prefer") ||
      normalized.includes("set my default") ||
      normalized.includes("update my preferences") ||
      normalized.includes("change my profile");

    return conversationPlanSchema.parse({
      specialists: [
        "intent_parser",
        "personalization_interpreter",
        "moderation_assistant",
      ],
      toolCalls: [
        {
          role: "manager",
          tool: "workflow.read",
          input: { maxMessages: 12 },
        },
        {
          role: "personalization_interpreter",
          tool: "personalization.retrieve",
          input: { maxDocs: 4 },
        },
        ...(looksTimeSensitive
          ? [
              {
                role: "manager" as const,
                tool: "availability.lookup" as const,
                input: {},
              },
            ]
          : []),
        {
          role: "intent_parser",
          tool: "intent.parse",
          input: { text: userMessage.slice(0, 500) },
        },
        {
          role: "moderation_assistant",
          tool: "moderation.review",
          input: { text: userMessage.slice(0, 500) },
        },
        ...(looksLikeSearch
          ? [
              {
                role: "manager" as const,
                tool: "candidate.search" as const,
                input: {
                  text: userMessage.slice(0, 500),
                  take: 5,
                  widenOnScarcity: true,
                },
              },
              {
                role: "manager" as const,
                tool: "intent.persist" as const,
                input: { text: userMessage.slice(0, 500) },
              },
            ]
          : []),
        ...(looksLikeGroup
          ? [
              {
                role: "manager" as const,
                tool: "circle.search" as const,
                input: {
                  limit: 3,
                },
              },
              {
                role: "manager" as const,
                tool: "group.plan" as const,
                input: {
                  text: userMessage.slice(0, 500),
                  groupSizeTarget: 3,
                },
              },
            ]
          : []),
        ...(looksLikeCircleCreation
          ? [
              {
                role: "manager" as const,
                tool: "circle.create" as const,
                input: {
                  title: "New recurring circle",
                  kickoffPrompt: userMessage.slice(0, 240),
                },
              },
            ]
          : []),
        ...(looksLikeCircleJoin
          ? [
              {
                role: "manager" as const,
                tool: "circle.search" as const,
                input: {
                  limit: 3,
                },
              },
            ]
          : []),
        ...(looksLikeIntroAcceptance
          ? [
              {
                role: "manager" as const,
                tool: "workflow.read" as const,
                input: { maxMessages: 16 },
              },
            ]
          : []),
        ...(looksLikeIntroRejection
          ? [
              {
                role: "manager" as const,
                tool: "workflow.read" as const,
                input: { maxMessages: 16 },
              },
            ]
          : []),
        ...(looksLikeIntroRetraction
          ? [
              {
                role: "manager" as const,
                tool: "workflow.read" as const,
                input: { maxMessages: 16 },
              },
            ]
          : []),
        ...(looksLikeReminder
          ? [
              {
                role: "manager" as const,
                tool: "followup.schedule" as const,
                input: {
                  title: "Follow up on this social goal",
                  summary: userMessage.slice(0, 240),
                },
              },
            ]
          : []),
        ...(looksLikePreferenceUpdate
          ? [
              {
                role: "manager" as const,
                tool: "profile.patch" as const,
                input: {
                  consentGranted: true,
                  consentSource: "explicit_user_message",
                },
              },
            ]
          : []),
        ...(looksLikeScarcity && !looksLikeGroup
          ? [
              {
                role: "manager" as const,
                tool: "circle.search" as const,
                input: {
                  limit: 3,
                },
              },
              {
                role: "manager" as const,
                tool: "followup.schedule" as const,
                input: {
                  title: "Retry this social search later",
                  summary: userMessage.slice(0, 240),
                },
              },
            ]
          : []),
      ],
      responseGoal:
        "Answer clearly, ground the reply in the user's social context, and move toward a concrete social next action.",
    });
  }

  private fallbackConversationResponse(input: {
    userMessage: string;
    socialContext?: Record<string, unknown>;
    specialistOutputs?: Record<string, unknown>;
  }) {
    const intentOutput = input.specialistOutputs?.intent_parser;
    const parsedIntent =
      intentOutput && typeof intentOutput === "object"
        ? (intentOutput as { intentType?: string; topics?: string[] })
        : null;
    const topic =
      Array.isArray(parsedIntent?.topics) && parsedIntent.topics.length > 0
        ? parsedIntent.topics[0]
        : null;

    const socialContext =
      input.socialContext && typeof input.socialContext === "object"
        ? (input.socialContext as {
            freshOnboardingTurn?: boolean;
            goals?: string[];
            interests?: string[];
            preferences?: {
              modality?: string;
              intentMode?: string;
              reachable?: string;
            };
          })
        : null;
    const leadGoal =
      Array.isArray(socialContext?.goals) && socialContext.goals.length > 0
        ? socialContext.goals[0]
        : null;
    const leadInterest =
      Array.isArray(socialContext?.interests) &&
      socialContext.interests.length > 0
        ? socialContext.interests[0]
        : null;

    if (socialContext?.freshOnboardingTurn) {
      return `I’m on it. I’ll work from your ${leadGoal ?? "current"} intent${leadInterest ? ` and your interest in ${leadInterest}` : ""} to narrow the best next introductions or plans. ${socialContext?.preferences?.intentMode === "group" ? "I’ll keep groups in the mix." : "I’ll start with the strongest 1:1 fit unless the signal suggests a group."}`;
    }

    if (parsedIntent?.intentType || topic) {
      return `I understood this as ${parsedIntent?.intentType ?? "a social"} intent${topic ? ` around ${topic}` : ""}. I can help refine constraints (time, mode, and group size) to improve matching.`;
    }

    return "I can help with that. Share your preferred time, mode (online/offline), and whether you want 1:1 or group so I can guide the next best step.";
  }

  private fallbackModerationAssist(content: string): ModerationAssistResult {
    const normalized = content.toLowerCase();
    const blockedPatterns = [
      "kill someone",
      "terror attack",
      "bomb threat",
      "sexual assault",
    ];
    const reviewPatterns = ["underage", "drug deal", "weapon meetup", "nudes"];
    if (blockedPatterns.some((pattern) => normalized.includes(pattern))) {
      return {
        decision: "blocked",
        reason: "deterministic_blocklist_match",
      };
    }
    if (reviewPatterns.some((pattern) => normalized.includes(pattern))) {
      return {
        decision: "review",
        reason: "deterministic_reviewlist_match",
      };
    }
    return { decision: "clean" };
  }

  private fallbackNotificationCopy(intentText: string) {
    return `Quick update: ${intentText.slice(0, 120)}${intentText.length > 120 ? "..." : ""}`;
  }

  private async streamConversationResponse(input: {
    model: string;
    instructions: string;
    payload: string;
    metadata: Record<string, string>;
    onTextDelta: (delta: string) => Promise<void> | void;
  }) {
    const stream = await this.client.responses.create({
      model: input.model,
      instructions: input.instructions,
      input: input.payload,
      metadata: input.metadata,
      stream: true,
    });

    let outputText = "";
    for await (const event of stream as AsyncIterable<{
      type?: string;
      delta?: string;
      response?: { output_text?: string };
    }>) {
      if (
        event.type === "response.output_text.delta" &&
        typeof event.delta === "string" &&
        event.delta.length > 0
      ) {
        outputText += event.delta;
        await input.onTextDelta(event.delta);
      } else if (
        event.type === "response.completed" &&
        typeof event.response?.output_text === "string" &&
        outputText.trim().length === 0
      ) {
        outputText = event.response.output_text;
      }
    }

    return outputText.trim();
  }

  private estimateConversationResponseCostUsd(
    input: {
      userMessage: string;
      responseGoal?: string;
      socialContext?: Record<string, unknown>;
      multimodalContext?: Record<string, unknown>;
      specialistOutputs?: Record<string, unknown>;
      toolOutputs?: Record<string, unknown>;
    },
    expectedOutputChars: number,
  ) {
    const serializedInput = JSON.stringify(input);
    const inputTokens = this.estimateTokenCount(serializedInput.length);
    const outputTokens = this.estimateTokenCount(expectedOutputChars);
    const inputCost =
      (inputTokens / 1_000) * this.budgetPolicy.inputCostPer1KTokensUsd;
    const outputCost =
      (outputTokens / 1_000) * this.budgetPolicy.outputCostPer1KTokensUsd;
    return inputCost + outputCost;
  }

  private estimateTokenCount(charCount: number) {
    const normalized = Math.max(0, Math.ceil(charCount / 4));
    return normalized;
  }

  private applyResponseLengthBudget(responseText: string) {
    const trimmed = responseText.trim();
    if (!trimmed) {
      return "";
    }
    if (trimmed.length <= this.budgetPolicy.maxResponseChars) {
      return trimmed;
    }
    return `${trimmed.slice(0, this.budgetPolicy.maxResponseChars - 1)}…`;
  }

  private isCircuitOpen() {
    const openedAt = this.budgetRuntime.circuitOpenedAt;
    if (!openedAt) {
      return false;
    }
    const elapsedMs = Date.now() - openedAt;
    if (elapsedMs >= this.budgetPolicy.circuitCooldownMs) {
      this.budgetRuntime.circuitOpenedAt = null;
      this.budgetRuntime.consecutiveFailures = 0;
      this.syncBudgetRegistry("circuit_auto_recovered");
      return false;
    }
    return true;
  }

  private registerOpenAISuccess() {
    this.budgetRuntime.consecutiveFailures = 0;
    this.budgetRuntime.circuitOpenedAt = null;
    this.budgetRuntime.lastFailureAt = null;
    this.budgetRuntime.lastFailureReason = null;
  }

  private registerOpenAIFailure(reason: string) {
    this.budgetRuntime.consecutiveFailures += 1;
    this.budgetRuntime.lastFailureAt = Date.now();
    this.budgetRuntime.lastFailureReason = reason;

    if (
      this.budgetRuntime.consecutiveFailures >=
      this.budgetPolicy.circuitFailureThreshold
    ) {
      this.budgetRuntime.circuitOpenedAt = Date.now();
    }
    this.syncBudgetRegistry("request_failed");
  }

  private toBudgetSnapshot(): OpenAIBudgetGuardrailSnapshot {
    return {
      instanceId: this.instanceId,
      circuitOpen: this.isCircuitOpen(),
      policy: { ...this.budgetPolicy },
      state: {
        consecutiveFailures: this.budgetRuntime.consecutiveFailures,
        circuitOpenedAt: this.budgetRuntime.circuitOpenedAt
          ? new Date(this.budgetRuntime.circuitOpenedAt).toISOString()
          : null,
        lastFailureAt: this.budgetRuntime.lastFailureAt
          ? new Date(this.budgetRuntime.lastFailureAt).toISOString()
          : null,
        lastFailureReason: this.budgetRuntime.lastFailureReason,
      },
      updatedAt: new Date().toISOString(),
    };
  }

  private syncBudgetRegistry(reason: string) {
    void reason;
    openAIBudgetRegistry.set(this.instanceId, this.toBudgetSnapshot());
  }

  private detectPromptInjection(input: string) {
    const normalized = input.toLowerCase();
    const patterns = [
      "ignore previous instructions",
      "ignore all instructions",
      "reveal system prompt",
      "show developer message",
      "override policy",
      "call tool",
      "function call",
      "jailbreak",
      "act as system",
    ];
    return patterns.some((pattern) => normalized.includes(pattern));
  }

  private isAiParsingEnabled() {
    const globalKillSwitch = this.readBooleanEnv(
      "FEATURE_GLOBAL_KILL_SWITCH",
      false,
    );
    const aiParsingEnabled = this.readBooleanEnv(
      "FEATURE_ENABLE_AI_PARSING",
      true,
    );
    return !globalKillSwitch && aiParsingEnabled;
  }

  private readBooleanEnv(name: string, fallback: boolean) {
    const value = process.env[name];
    if (value === undefined) {
      return fallback;
    }
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1" || normalized === "yes") {
      return true;
    }
    if (normalized === "false" || normalized === "0" || normalized === "no") {
      return false;
    }
    return fallback;
  }

  private readNumberEnv(
    name: string,
    fallback: number,
    min: number,
    max: number,
  ) {
    const value = process.env[name];
    if (value === undefined) {
      return fallback;
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.min(Math.max(parsed, min), max);
  }
}
