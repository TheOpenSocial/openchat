import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { OpenAIClient } from "@opensocial/openai";
import {
  onboardingActivationPlanBodySchema,
  onboardingActivationPlanResponseSchema,
  onboardingInferResponseSchema,
  onboardingQuickInferResponseSchema,
} from "@opensocial/types";
import { createHash, randomUUID } from "node:crypto";
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

const GENERIC_PERSONA_LABELS = new Set([
  "connector",
  "explorer",
  "social builder",
  "researcher",
  "planner",
  "friend",
  "social",
]);

const GENERIC_SUMMARY_FRAGMENTS = [
  "meet people",
  "make plans",
  "social plans",
  "connect with people",
  "new connections",
];

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
    const llmInferred = await this.withTimeout(
      fastClient.inferOnboardingQuick(raw, traceId),
      this.onboardingQuickTimeoutMs,
      "onboarding_fast_pass",
    );
    const durationMs = Date.now() - startedAt;

    if (llmInferred) {
      const normalized = this.normalizeQuickInferencePayload(llmInferred, raw);
      const level = durationMs > 2500 ? "warn" : "log";
      this.logger[level](
        `onboarding fast inference completed traceId=${traceId} model=${selectedFastModel} durationMs=${durationMs} followUp=${Boolean(normalized.followUpQuestion?.trim())} summaryChars=${normalized.summary?.length ?? 0} interestsCount=${normalized.interests?.length ?? 0}`,
      );
      recordOnboardingInferenceMetric({
        mode: "fast",
        model: selectedFastModel,
        durationMs,
        unavailable: false,
        fallback: false,
      });
      return {
        ...normalized,
        lifecycle: {
          current: "infer-success",
          transitions: [
            "infer-started",
            "infer-processing",
            "infer-success",
          ] as const,
        },
      };
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
    return this.withLifecycle(this.buildQuickFallback(raw), true);
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
    const llmInferred = await this.withTimeout(
      richClient.inferOnboarding(raw, traceId),
      this.onboardingRichTimeoutMs,
      "onboarding_inference",
    );
    const durationMs = Date.now() - startedAt;

    if (llmInferred) {
      const normalized = this.normalizeRichInferencePayload(llmInferred, raw);
      const level = durationMs > 12000 ? "warn" : "log";
      this.logger[level](
        `onboarding inference completed traceId=${traceId} model=${selectedRichModel} durationMs=${durationMs} persona="${normalized.persona}" followUp=${Boolean(normalized.followUpQuestion?.trim())} interestsCount=${normalized.interests?.length ?? 0} goalsCount=${normalized.goals?.length ?? 0}`,
      );
      recordOnboardingInferenceMetric({
        mode: "rich",
        model: selectedRichModel,
        durationMs,
        unavailable: false,
        fallback: false,
      });
      return {
        ...normalized,
        lifecycle: {
          current: "infer-success",
          transitions: [
            "infer-started",
            "infer-processing",
            "infer-success",
          ] as const,
        },
      };
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
    return this.withLifecycle(this.buildRichFallback(raw), true);
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
    const llmInferred = await this.withTimeout(
      fastClient.inferOnboardingQuick(transcript, traceId),
      this.onboardingQuickTimeoutMs,
      "onboarding_fast_pass",
    );
    const durationMs = Date.now() - startedAt;
    if (llmInferred?.firstIntent?.trim()) {
      const recommendationText = llmInferred.firstIntent.trim();
      const activationIdentity = this.buildActivationIdentity(
        input.userId,
        recommendationText,
      );
      this.logger.log(
        `onboarding activation plan ready traceId=${traceId} model=${selectedFastModel} durationMs=${durationMs} source=llm`,
      );
      return {
        state: "ready",
        source: "llm",
        idempotencyKey: activationIdentity.idempotencyKey,
        activationFingerprint: activationIdentity.fingerprint,
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

  private withLifecycle<T extends { lifecycle?: unknown }>(
    payload: T,
    fallback: boolean,
  ): T {
    const lifecycle = fallback
      ? {
          current: "infer-fallback",
          transitions: [
            "infer-started",
            "infer-processing",
            "infer-fallback",
          ] as const,
        }
      : {
          current: "infer-success",
          transitions: [
            "infer-started",
            "infer-processing",
            "infer-success",
          ] as const,
        };
    return {
      ...payload,
      lifecycle,
    };
  }

  private buildSummary(transcript: string): string {
    return transcript.length > 160
      ? `${transcript.slice(0, 157).trimEnd()}...`
      : transcript;
  }

  private normalizeQuickInferencePayload(
    payload: OnboardingQuickInferResponse,
    transcript: string,
  ): OnboardingQuickInferResponse {
    const interests =
      payload.interests.length > 0
        ? payload.interests
        : this.extractInterests(transcript).slice(0, 8);
    const goals =
      payload.goals.length > 0
        ? payload.goals
        : this.extractGoals(transcript).slice(0, 6);
    const summary = this.normalizeSummaryText({
      summary: payload.summary,
      transcript,
      interests,
      goals,
    });
    const firstIntent = payload.firstIntent?.trim() || transcript.trim();
    return {
      ...payload,
      interests,
      goals,
      summary,
      firstIntent,
    };
  }

  private normalizeRichInferencePayload(
    payload: OnboardingInferResponse,
    transcript: string,
  ): OnboardingInferResponse {
    const interests =
      payload.interests.length > 0
        ? payload.interests
        : this.extractInterests(transcript).slice(0, 12);
    const goals =
      payload.goals.length > 0
        ? payload.goals
        : this.extractGoals(transcript).slice(0, 8);
    const summary = this.normalizeSummaryText({
      summary: payload.summary,
      transcript,
      interests,
      goals,
    });
    const persona = this.normalizePersonaLabel(
      payload.persona,
      interests,
      goals,
    );
    return {
      ...payload,
      interests,
      goals,
      summary,
      persona,
    };
  }

  private normalizePersonaLabel(
    persona: string,
    interests: string[],
    goals: string[],
  ): string {
    const trimmed = persona.trim();
    const normalized = trimmed.toLowerCase();
    if (trimmed.length > 0 && !GENERIC_PERSONA_LABELS.has(normalized)) {
      return trimmed;
    }
    const primaryInterest = interests.find((value) => value.trim().length > 0);
    const primaryGoal = goals.find((value) => value.trim().length > 0);
    if (primaryInterest) {
      return `${this.toTitleCase(primaryInterest)} Connector`;
    }
    if (primaryGoal) {
      return `${this.toTitleCase(primaryGoal)} Planner`;
    }
    return "Intent-led Connector";
  }

  private normalizeSummaryText(input: {
    summary: string;
    transcript: string;
    interests: string[];
    goals: string[];
  }): string {
    const summary = input.summary.trim();
    if (!this.isLikelyGenericSummary(summary)) {
      return summary;
    }
    const interests = input.interests.slice(0, 2).join(" and ");
    const goals = input.goals.slice(0, 1).join(", ");
    const anchoredInterests =
      interests.length > 0 ? interests : "relevant activities";
    const anchoredGoals = goals.length > 0 ? ` with a focus on ${goals}` : "";
    return `You’re looking for ${anchoredInterests}${anchoredGoals}.`;
  }

  private isLikelyGenericSummary(value: string): boolean {
    const normalized = value.trim().toLowerCase();
    if (normalized.length < 24) {
      return true;
    }
    return GENERIC_SUMMARY_FRAGMENTS.some(
      (fragment) =>
        normalized === fragment || normalized.includes(` ${fragment}`),
    );
  }

  private toTitleCase(value: string): string {
    return value
      .split(/\s+/)
      .filter((part) => part.length > 0)
      .map((part) => part[0]!.toUpperCase() + part.slice(1).toLowerCase())
      .join(" ");
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
    const activationIdentity = this.buildActivationIdentity(input.userId, seed);

    return {
      state: "ready",
      source: "fallback",
      idempotencyKey: activationIdentity.idempotencyKey,
      activationFingerprint: activationIdentity.fingerprint,
      summary,
      recommendedAction: {
        kind: "agent_thread_seed",
        label: "Start with this",
        text: seed,
      },
    };
  }

  private buildActivationIdentity(
    userId: string,
    seedText: string,
  ): {
    fingerprint: string;
    idempotencyKey: string;
  } {
    const normalizedSeed = seedText.trim().toLowerCase().replace(/\s+/g, " ");
    const fingerprint = createHash("sha256")
      .update(`${userId}:${normalizedSeed}`)
      .digest("hex")
      .slice(0, 16);
    return {
      fingerprint,
      idempotencyKey: `onboarding-carryover:${userId}:${fingerprint}`,
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

  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    task: "onboarding_fast_pass" | "onboarding_inference",
  ): Promise<T | null> {
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    try {
      const timeoutPromise = new Promise<null>((resolve) => {
        timeoutHandle = setTimeout(() => resolve(null), timeoutMs);
      });
      const result = await Promise.race([promise, timeoutPromise]);
      if (result === null) {
        this.logger.warn(
          `onboarding ${task} timed out after ${timeoutMs}ms; using fallback`,
        );
      }
      return result as T | null;
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }
}
