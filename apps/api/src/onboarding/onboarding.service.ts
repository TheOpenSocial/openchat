import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { OpenAIClient } from "@opensocial/openai";
import {
  onboardingInferResponseSchema,
  onboardingQuickInferResponseSchema,
} from "@opensocial/types";
import { randomUUID } from "node:crypto";
import { z } from "zod";

type OnboardingInferResponse = z.infer<typeof onboardingInferResponseSchema>;
type OnboardingQuickInferResponse = z.infer<
  typeof onboardingQuickInferResponseSchema
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
  private readonly fastOpenai = new OpenAIClient(
    process.env.ONBOARDING_LLM_BASE_URL
      ? {
          apiKey:
            process.env.ONBOARDING_LLM_API_KEY ??
            process.env.OPENAI_API_KEY ??
            "",
          baseURL: process.env.ONBOARDING_LLM_BASE_URL,
          providerName:
            process.env.ONBOARDING_LLM_PROVIDER?.trim() || "ollama-cloud",
          modelRouting: {
            onboarding_fast_pass:
              process.env.ONBOARDING_LLM_FAST_MODEL ??
              process.env.ONBOARDING_LLM_MODEL,
          },
          timeoutMs: this.onboardingQuickTimeoutMs,
          maxRetries: 0,
        }
      : {
          apiKey: process.env.OPENAI_API_KEY ?? "",
          providerName: "openai",
          timeoutMs: this.onboardingQuickTimeoutMs,
          maxRetries: 0,
        },
  );
  private readonly richOpenai = new OpenAIClient(
    process.env.ONBOARDING_LLM_BASE_URL
      ? {
          apiKey:
            process.env.ONBOARDING_LLM_API_KEY ??
            process.env.OPENAI_API_KEY ??
            "",
          baseURL: process.env.ONBOARDING_LLM_BASE_URL,
          providerName:
            process.env.ONBOARDING_LLM_PROVIDER?.trim() || "ollama-cloud",
          modelRouting: {
            onboarding_inference:
              process.env.ONBOARDING_LLM_RICH_MODEL ??
              process.env.ONBOARDING_LLM_MODEL,
          },
          timeoutMs: this.onboardingRichTimeoutMs,
          maxRetries: 0,
        }
      : {
          apiKey: process.env.OPENAI_API_KEY ?? "",
          providerName: "openai",
          timeoutMs: this.onboardingRichTimeoutMs,
          maxRetries: 0,
        },
  );

  async inferQuickFromTranscript(
    _userId: string,
    transcript: string,
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

    const llmInferred = await this.fastOpenai.inferOnboardingQuick(
      raw,
      traceId,
    );
    const durationMs = Date.now() - startedAt;

    if (llmInferred) {
      const level = durationMs > 2500 ? "warn" : "log";
      this.logger[level](
        `onboarding fast inference completed traceId=${traceId} durationMs=${durationMs} followUp=${Boolean(llmInferred.followUpQuestion?.trim())}`,
      );
      return llmInferred;
    }

    this.logger.warn(
      `onboarding fast inference unavailable, using fallback traceId=${traceId} durationMs=${durationMs}`,
    );
    return this.buildQuickFallback(raw);
  }

  async inferFromTranscript(
    _userId: string,
    transcript: string,
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

    const llmInferred = await this.richOpenai.inferOnboarding(raw, traceId);
    const durationMs = Date.now() - startedAt;

    if (llmInferred) {
      const level = durationMs > 12000 ? "warn" : "log";
      this.logger[level](
        `onboarding inference completed traceId=${traceId} durationMs=${durationMs} persona="${llmInferred.persona}" followUp=${Boolean(llmInferred.followUpQuestion?.trim())}`,
      );
      return llmInferred;
    }

    this.logger.warn(
      `onboarding inference unavailable, using fallback traceId=${traceId} durationMs=${durationMs}`,
    );
    return this.buildRichFallback(raw);
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
