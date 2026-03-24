import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { OpenAIClient } from "@opensocial/openai";
import {
  onboardingActivationPlanBodySchema,
  onboardingActivationPlanResponseSchema,
  onboardingInferResponseSchema,
  onboardingQuickInferResponseSchema,
} from "@opensocial/types";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { recordOnboardingInferenceMetric } from "../common/ops-metrics.js";

type OnboardingInferResponse = z.infer<typeof onboardingInferResponseSchema>;
type OnboardingQuickInferResponse = z.infer<
  typeof onboardingQuickInferResponseSchema
>;
type OnboardingActivationPlanInput = z.infer<
  typeof onboardingActivationPlanBodySchema
>;
type OnboardingActivationPlanResponse = z.infer<
  typeof onboardingActivationPlanResponseSchema
>;

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);
  private readonly onboardingQuickTimeoutMs = Math.max(
    1_000,
    Number(process.env.ONBOARDING_LLM_TIMEOUT_MS ?? 4_000) || 4_000,
  );
  private readonly onboardingRichTimeoutMs = Math.max(
    this.onboardingQuickTimeoutMs,
    Number(process.env.ONBOARDING_LLM_RICH_TIMEOUT_MS ?? 15_000) || 15_000,
  );
  private readonly defaultFastModel =
    process.env.ONBOARDING_LLM_FAST_MODEL ?? process.env.ONBOARDING_LLM_MODEL;
  private readonly defaultRichModel =
    process.env.ONBOARDING_LLM_RICH_MODEL ?? process.env.ONBOARDING_LLM_MODEL;
  private readonly fastModelCandidates = this.parseModelCandidates(
    process.env.ONBOARDING_LLM_FAST_MODEL_CANDIDATES,
    this.defaultFastModel,
  );
  private readonly richModelCandidates = this.parseModelCandidates(
    process.env.ONBOARDING_LLM_RICH_MODEL_CANDIDATES,
    this.defaultRichModel,
  );
  private readonly fastOpenaiByModel = new Map<string, OpenAIClient>();
  private readonly richOpenaiByModel = new Map<string, OpenAIClient>();

  constructor() {
    for (const model of this.fastModelCandidates) {
      this.fastOpenaiByModel.set(
        model,
        this.createOnboardingClient("onboarding_fast_pass", model, {
          timeoutMs: this.onboardingQuickTimeoutMs,
        }),
      );
    }
    for (const model of this.richModelCandidates) {
      this.richOpenaiByModel.set(
        model,
        this.createOnboardingClient("onboarding_inference", model, {
          timeoutMs: this.onboardingRichTimeoutMs,
        }),
      );
    }
    this.logger.log(
      `onboarding model candidates configured fast=[${this.fastModelCandidates.join(", ")}] rich=[${this.richModelCandidates.join(", ")}]`,
    );
  }

  async inferQuickFromTranscript(
    _userId: string,
    transcript: string,
    options?: { modelOverride?: string },
  ): Promise<OnboardingQuickInferResponse> {
    const raw = transcript.trim();
    if (!raw) {
      throw new BadRequestException("onboarding transcript is required");
    }

    const traceId = randomUUID();
    const startedAt = Date.now();
    this.logger.log(
      `onboarding fast inference started traceId=${traceId} transcriptChars=${raw.length} timeoutMs=${this.onboardingQuickTimeoutMs}`,
    );

    const requestedModel = options?.modelOverride?.trim();
    const selectedFastModel =
      requestedModel ||
      this.pickModelCandidate(traceId, this.fastModelCandidates);
    const fastClient = this.resolveClient(
      "onboarding_fast_pass",
      selectedFastModel,
      this.fastOpenaiByModel,
      this.onboardingQuickTimeoutMs,
    );
    const llmInferred = await fastClient.inferOnboardingQuick(raw, traceId);
    const durationMs = Date.now() - startedAt;

    if (llmInferred) {
      const level = durationMs > 2500 ? "warn" : "log";
      this.logger[level](
        `onboarding fast inference completed traceId=${traceId} model=${selectedFastModel} durationMs=${durationMs} followUp=${Boolean(llmInferred.followUpQuestion?.trim())} summaryChars=${llmInferred.summary?.length ?? 0} interestsCount=${llmInferred.interests?.length ?? 0}`,
      );
      recordOnboardingInferenceMetric({
        mode: "fast",
        model: selectedFastModel,
        durationMs,
        unavailable: false,
        fallback: false,
      });
      return llmInferred;
    }

    this.logger.warn(
      `onboarding fast inference unavailable, using fallback traceId=${traceId} model=${selectedFastModel} durationMs=${durationMs}`,
    );
    recordOnboardingInferenceMetric({
      mode: "fast",
      model: selectedFastModel,
      durationMs,
      unavailable: true,
      fallback: true,
    });
    return this.buildQuickFallback(raw);
  }

  async inferFromTranscript(
    _userId: string,
    transcript: string,
    options?: { modelOverride?: string },
  ): Promise<OnboardingInferResponse> {
    const raw = transcript.trim();
    if (!raw) {
      throw new BadRequestException("onboarding transcript is required");
    }

    const traceId = randomUUID();
    const startedAt = Date.now();
    this.logger.log(
      `onboarding inference started traceId=${traceId} transcriptChars=${raw.length} timeoutMs=${this.onboardingRichTimeoutMs}`,
    );

    const requestedModel = options?.modelOverride?.trim();
    const selectedRichModel =
      requestedModel ||
      this.pickModelCandidate(traceId, this.richModelCandidates);
    const richClient = this.resolveClient(
      "onboarding_inference",
      selectedRichModel,
      this.richOpenaiByModel,
      this.onboardingRichTimeoutMs,
    );
    const llmInferred = await richClient.inferOnboarding(raw, traceId);
    const durationMs = Date.now() - startedAt;

    if (llmInferred) {
      const level = durationMs > 12000 ? "warn" : "log";
      this.logger[level](
        `onboarding inference completed traceId=${traceId} model=${selectedRichModel} durationMs=${durationMs} persona="${llmInferred.persona}" followUp=${Boolean(llmInferred.followUpQuestion?.trim())} interestsCount=${llmInferred.interests?.length ?? 0} goalsCount=${llmInferred.goals?.length ?? 0}`,
      );
      recordOnboardingInferenceMetric({
        mode: "rich",
        model: selectedRichModel,
        durationMs,
        unavailable: false,
        fallback: false,
      });
      return llmInferred;
    }

    this.logger.warn(
      `onboarding inference unavailable, using fallback traceId=${traceId} model=${selectedRichModel} durationMs=${durationMs}`,
    );
    recordOnboardingInferenceMetric({
      mode: "rich",
      model: selectedRichModel,
      durationMs,
      unavailable: true,
      fallback: true,
    });
    return this.buildRichFallback(raw);
  }

  async buildActivationPlan(
    input: OnboardingActivationPlanInput,
  ): Promise<OnboardingActivationPlanResponse> {
    const transcript = this.buildActivationPlanTranscript(input);
    const traceId = randomUUID();
    const startedAt = Date.now();
    if (!transcript) {
      return this.buildActivationFallbackPlan(input, "missing_context");
    }

    const selectedFastModel = this.pickModelCandidate(
      traceId,
      this.fastModelCandidates,
    );
    const fastClient = this.resolveClient(
      "onboarding_fast_pass",
      selectedFastModel,
      this.fastOpenaiByModel,
      this.onboardingQuickTimeoutMs,
    );
    const llmInferred = await fastClient.inferOnboardingQuick(
      transcript,
      traceId,
    );
    const durationMs = Date.now() - startedAt;
    if (llmInferred?.firstIntent?.trim()) {
      const recommendationText = llmInferred.firstIntent.trim();
      this.logger.log(
        `onboarding activation plan ready traceId=${traceId} model=${selectedFastModel} durationMs=${durationMs} source=llm`,
      );
      return {
        state: "ready",
        source: "llm",
        summary:
          llmInferred.summary?.trim() ||
          "We prepared your first step based on what you shared.",
        recommendedAction: {
          kind: "agent_thread_seed",
          label: "Start with this",
          text: recommendationText,
        },
      };
    }

    this.logger.warn(
      `onboarding activation plan fallback traceId=${traceId} model=${selectedFastModel} durationMs=${durationMs} reason=llm_unavailable`,
    );
    return this.buildActivationFallbackPlan(input, "llm_unavailable");
  }

  private parseModelCandidates(
    value: string | undefined,
    defaultModel: string | undefined,
  ): string[] {
    const fromEnv = (value ?? "")
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
    if (fromEnv.length > 0) {
      return Array.from(new Set(fromEnv));
    }
    return defaultModel ? [defaultModel] : ["gpt-4.1-mini"];
  }

  private pickModelCandidate(traceId: string, candidates: string[]): string {
    if (candidates.length === 0) {
      return "gpt-4.1-mini";
    }
    if (candidates.length === 1) {
      return candidates[0]!;
    }
    let hash = 0;
    for (const ch of traceId) {
      hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    }
    return candidates[hash % candidates.length]!;
  }

  private createOnboardingClient(
    task: "onboarding_fast_pass" | "onboarding_inference",
    model: string,
    options: { timeoutMs: number },
  ): OpenAIClient {
    return new OpenAIClient({
      apiKey: process.env.OPENAI_API_KEY ?? "",
      providerName: "openai",
      modelRouting: {
        [task]: model,
      },
      timeoutMs: options.timeoutMs,
      maxRetries: 0,
    });
  }

  private resolveClient(
    task: "onboarding_fast_pass" | "onboarding_inference",
    model: string,
    cache: Map<string, OpenAIClient>,
    timeoutMs: number,
  ): OpenAIClient {
    const cached = cache.get(model);
    if (cached) {
      return cached;
    }
    const client = this.createOnboardingClient(task, model, { timeoutMs });
    cache.set(model, client);
    return client;
  }

  private buildQuickFallback(transcript: string): OnboardingQuickInferResponse {
    const compact = transcript.trim();
    return {
      transcript: compact,
      interests: this.extractInterests(compact).slice(0, 8),
      goals: this.extractGoals(compact).slice(0, 6),
      summary: this.buildSummary(compact),
      firstIntent: compact,
      followUpQuestion:
        "What kind of people or plans would feel perfect for your first week?",
    };
  }

  private buildRichFallback(transcript: string): OnboardingInferResponse {
    const compact = transcript.trim();
    return {
      transcript: compact,
      interests: this.extractInterests(compact).slice(0, 12),
      goals: this.extractGoals(compact).slice(0, 8),
      mode: "social",
      format: "small_groups",
      style: "Chill",
      availability: "Flexible",
      area: "",
      country: "",
      summary: this.buildSummary(compact),
      persona: "Connector",
      firstIntent: compact,
      followUpQuestion:
        "Should we prioritize local meetups, 1:1 chats, or activity-based groups first?",
      inferenceMeta: {
        goals: {
          source: "inferred",
          confidence: 0.45,
          needsConfirmation: true,
        },
        interests: {
          source: "inferred",
          confidence: 0.45,
          needsConfirmation: true,
        },
        format: {
          source: "inferred",
          confidence: 0.35,
          needsConfirmation: true,
        },
        mode: { source: "inferred", confidence: 0.35, needsConfirmation: true },
        style: {
          source: "inferred",
          confidence: 0.35,
          needsConfirmation: true,
        },
        availability: {
          source: "inferred",
          confidence: 0.35,
          needsConfirmation: true,
        },
        location: {
          source: "inferred",
          confidence: 0.2,
          needsConfirmation: true,
        },
        firstIntent: {
          source: "voice",
          confidence: 0.9,
          needsConfirmation: false,
        },
        persona: {
          source: "inferred",
          confidence: 0.4,
          needsConfirmation: true,
        },
      },
    };
  }

  private buildSummary(transcript: string): string {
    return transcript.length > 160
      ? `${transcript.slice(0, 157).trimEnd()}...`
      : transcript;
  }

  private buildActivationPlanTranscript(
    input: OnboardingActivationPlanInput,
  ): string {
    const chunks = [
      input.firstIntentText?.trim() ?? "",
      input.summary?.trim() ?? "",
      input.persona?.trim() ? `Persona: ${input.persona.trim()}` : "",
      input.goals?.length ? `Goals: ${input.goals.join(", ")}.` : "",
      input.interests?.length
        ? `Interests: ${input.interests.join(", ")}.`
        : "",
      input.city?.trim() ? `City: ${input.city.trim()}.` : "",
      input.country?.trim() ? `Country: ${input.country.trim()}.` : "",
      input.socialMode ? `Preferred mode: ${input.socialMode}.` : "",
    ]
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    return chunks.join(" ").slice(0, 2000).trim();
  }

  private buildActivationFallbackPlan(
    input: OnboardingActivationPlanInput,
    reason: "missing_context" | "llm_unavailable",
  ): OnboardingActivationPlanResponse {
    const interests = (input.interests ?? []).slice(0, 3);
    const location = [input.city?.trim() ?? "", input.country?.trim() ?? ""]
      .filter((part) => part.length > 0)
      .join(", ");
    const focus =
      interests.length > 0 ? interests.join(", ") : "new social plans";
    const where = location ? ` in ${location}` : "";
    const seed =
      input.firstIntentText?.trim() ||
      `Help me find my best first social step around ${focus}${where}.`;
    const summary =
      reason === "missing_context"
        ? "We prepared a clean first step to get you started."
        : "We prepared a reliable first step while we refine your setup.";

    return {
      state: "ready",
      source: "fallback",
      summary,
      recommendedAction: {
        kind: "agent_thread_seed",
        label: "Start with this",
        text: seed,
      },
    };
  }

  private extractInterests(transcript: string): string[] {
    const lower = transcript.toLowerCase();
    const catalog: Array<{ key: string; terms: string[] }> = [
      { key: "design", terms: ["design", "ux", "ui"] },
      { key: "football", terms: ["football", "soccer", "futbol"] },
      { key: "gaming", terms: ["game", "gaming", "apex"] },
      { key: "startups", terms: ["startup", "founder", "build"] },
      { key: "technology", terms: ["tech", "technology", "ai"] },
      { key: "music", terms: ["music", "concert"] },
      { key: "fitness", terms: ["fitness", "gym", "workout"] },
      { key: "coffee", terms: ["coffee", "cafe"] },
      { key: "books", terms: ["books", "reading"] },
      { key: "travel", terms: ["travel", "trip"] },
    ];

    const matched = catalog
      .filter((entry) => entry.terms.some((term) => lower.includes(term)))
      .map((entry) => entry.key);

    return matched.length ? matched : ["social"];
  }

  private extractGoals(transcript: string): string[] {
    const lower = transcript.toLowerCase();
    const goals = new Set<string>();
    if (
      lower.includes("meet") ||
      lower.includes("friends") ||
      lower.includes("people")
    ) {
      goals.add("meet people");
    }
    if (
      lower.includes("plan") ||
      lower.includes("weekend") ||
      lower.includes("hang")
    ) {
      goals.add("make plans");
    }
    if (
      lower.includes("date") ||
      lower.includes("relationship") ||
      lower.includes("romantic")
    ) {
      goals.add("dating");
    }
    if (!goals.size) {
      goals.add("discover connections");
    }
    return [...goals];
  }
}
