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

    this.logger.error(
      `onboarding fast inference unavailable traceId=${traceId} durationMs=${durationMs}`,
    );
    throw new ServiceUnavailableException(
      "onboarding fast inference unavailable",
    );
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

    this.logger.error(
      `onboarding inference unavailable traceId=${traceId} durationMs=${durationMs}`,
    );
    throw new ServiceUnavailableException(
      "onboarding llm inference unavailable",
    );
  }
}
