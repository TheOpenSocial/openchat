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
        }
      : {
          apiKey: process.env.OPENAI_API_KEY ?? "",
          providerName: "openai",
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
      `onboarding inference started traceId=${traceId} transcriptChars=${raw.length}`,
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
