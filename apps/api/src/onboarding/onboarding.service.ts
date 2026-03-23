import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { OpenAIClient } from "@opensocial/openai";
import { onboardingInferResponseSchema } from "@opensocial/types";
import { randomUUID } from "node:crypto";
import { z } from "zod";

type OnboardingInferResponse = z.infer<typeof onboardingInferResponseSchema>;

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);
  private readonly onboardingTimeoutMs = Math.max(
    1_000,
    Number(process.env.ONBOARDING_LLM_TIMEOUT_MS ?? 4_000) || 4_000,
  );
  private readonly openai = new OpenAIClient(
    process.env.ONBOARDING_LLM_BASE_URL
      ? {
          apiKey:
            process.env.ONBOARDING_LLM_API_KEY ??
            process.env.OPENAI_API_KEY ??
            "",
          baseURL: process.env.ONBOARDING_LLM_BASE_URL,
          providerName:
            process.env.ONBOARDING_LLM_PROVIDER?.trim() || "ollama-cloud",
          modelRouting: process.env.ONBOARDING_LLM_MODEL
            ? {
                onboarding_inference: process.env.ONBOARDING_LLM_MODEL,
              }
            : undefined,
          timeoutMs:
            Math.max(
              1_000,
              Number(process.env.ONBOARDING_LLM_TIMEOUT_MS ?? 4_000) || 4_000,
            ) || 4_000,
          maxRetries: 0,
        }
      : {
          apiKey: process.env.OPENAI_API_KEY ?? "",
          providerName: "openai",
          timeoutMs:
            Math.max(
              1_000,
              Number(process.env.ONBOARDING_LLM_TIMEOUT_MS ?? 4_000) || 4_000,
            ) || 4_000,
          maxRetries: 0,
        },
  );

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
      `onboarding inference started traceId=${traceId} transcriptChars=${raw.length} timeoutMs=${this.onboardingTimeoutMs}`,
    );

    const llmInferred = await this.openai.inferOnboarding(raw, traceId);
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
