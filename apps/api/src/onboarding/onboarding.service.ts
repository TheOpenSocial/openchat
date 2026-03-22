import { Injectable } from "@nestjs/common";
import { OpenAIClient } from "@opensocial/openai";
import {
  IntentType,
  IntentUrgency,
  onboardingInferResponseSchema,
} from "@opensocial/types";
import { randomUUID } from "node:crypto";
import { z } from "zod";

type OnboardingInferResponse = z.infer<typeof onboardingInferResponseSchema>;

const GOAL_OPTIONS = [
  "Meet people",
  "Talk about interests",
  "Find things to do",
  "Make plans",
  "Join small groups",
  "Explore what’s happening",
  "Dating",
  "Gaming",
  "Professional / ideas",
] as const;

const TOPIC_KEYWORDS: Record<string, string[]> = {
  Music: ["music", "concert", "songs", "dj"],
  Movies: ["movies", "film", "cinema"],
  Startups: ["startup", "founder", "saas", "venture"],
  Design: ["design", "product design", "ux", "ui", "creative"],
  Fitness: ["fitness", "gym", "workout"],
  Football: ["football", "soccer", "match"],
  "Table tennis": ["table tennis", "ping pong"],
  Gaming: ["gaming", "games", "playstation", "xbox", "apex"],
  Travel: ["travel", "trip", "travelling"],
  Crypto: ["crypto", "bitcoin", "ethereum", "web3"],
  Food: ["food", "restaurant", "dinner", "coffee"],
  Books: ["books", "reading", "book club"],
  AI: ["ai", "artificial intelligence", "machine learning"],
  Running: ["running", "run", "jogging"],
  Nightlife: ["nightlife", "party", "bar", "club"],
  "Language exchange": [
    "language exchange",
    "languages",
    "spanish",
    "english practice",
  ],
};

@Injectable()
export class OnboardingService {
  private readonly openai = new OpenAIClient({
    apiKey: process.env.OPENAI_API_KEY ?? "",
  });

  async inferFromTranscript(
    _userId: string,
    transcript: string,
  ): Promise<OnboardingInferResponse> {
    const raw = transcript.trim();
    const traceId = randomUUID();
    const llmInferred = await this.openai.inferOnboarding(raw, traceId);
    if (llmInferred) {
      return llmInferred;
    }

    const parsed = await this.openai.parseIntent(raw, traceId);
    const lower = raw.toLowerCase();

    const interests = this.unique([
      ...parsed.topics,
      ...Object.entries(TOPIC_KEYWORDS)
        .filter(([, keywords]) =>
          keywords.some((keyword) => lower.includes(keyword)),
        )
        .map(([label]) => label),
    ]).slice(0, 12);

    const goals = this.unique([
      ...this.goalsFromIntent(parsed.intentType),
      ...(lower.includes("meet") || lower.includes("people")
        ? ["Meet people"]
        : []),
      ...(lower.includes("plan") ||
      lower.includes("weekend") ||
      lower.includes("tonight")
        ? ["Make plans"]
        : []),
      ...(lower.includes("dating") || lower.includes("date") ? ["Dating"] : []),
      ...(lower.includes("game") || lower.includes("gaming") ? ["Gaming"] : []),
      ...(lower.includes("startup") ||
      lower.includes("founder") ||
      lower.includes("ideas")
        ? ["Professional / ideas"]
        : []),
    ]).filter((goal): goal is (typeof GOAL_OPTIONS)[number] =>
      GOAL_OPTIONS.includes(goal as (typeof GOAL_OPTIONS)[number]),
    );

    const mode: OnboardingInferResponse["mode"] = lower.includes("dating")
      ? lower.includes("friends") || lower.includes("social")
        ? "both"
        : "dating"
      : "social";

    const format: OnboardingInferResponse["format"] =
      parsed.groupSizeTarget && parsed.groupSizeTarget > 2
        ? "small_groups"
        : /\b(1:1|one on one|one-to-one|private chat)\b/.test(lower)
          ? "one_to_one"
          : /\b(group|groups|small group|circle)\b/.test(lower)
            ? "small_groups"
            : "both";

    const style: OnboardingInferResponse["style"] =
      /\b(planned|organized|structured)\b/.test(lower)
        ? "Planned"
        : /\b(spontaneous|impromptu|random)\b/.test(lower)
          ? "Spontaneous"
          : /\b(focused|intentional|serious)\b/.test(lower)
            ? "Focused"
            : /\b(outgoing|social|energetic)\b/.test(lower)
              ? "Outgoing"
              : "Chill";

    const availability: OnboardingInferResponse["availability"] =
      parsed.urgency === IntentUrgency.NOW ||
      /\b(now|right now|asap)\b/.test(lower)
        ? "Right now"
        : parsed.urgency === IntentUrgency.TONIGHT ||
            parsed.urgency === IntentUrgency.TODAY ||
            /\b(evening|evenings|tonight|after work)\b/.test(lower)
          ? "Evenings"
          : /\b(weekend|weekends)\b/.test(lower)
            ? "Weekends"
            : "Flexible";

    const locationMatch = raw.match(
      /\b(?:in|around|near|from)\s+([A-Z][A-Za-z .'-]+(?:,\s*[A-Z][A-Za-z .'-]+)?)/,
    );
    const area = locationMatch?.[1]?.trim() ?? "";
    const country = "";

    const persona = this.personaFromSignals({
      goals,
      interests,
      format,
      style,
    });

    const summary = this.summaryFromSignals({
      goals,
      interests,
      format,
      availability,
      area,
      country,
    });

    return {
      transcript: raw,
      interests,
      goals,
      mode,
      format,
      style,
      availability,
      area,
      country,
      summary,
      persona,
      firstIntent: raw,
      ...(parsed.requiresFollowUp && parsed.followUpQuestion
        ? { followUpQuestion: parsed.followUpQuestion }
        : {}),
      inferenceMeta: {
        goals: this.meta(goals.length > 0 ? 0.84 : 0.42, goals.length === 0),
        interests: this.meta(
          interests.length > 0 ? 0.8 : 0.38,
          interests.length < 2,
        ),
        format: this.meta(format !== "both" ? 0.7 : 0.45, format === "both"),
        mode: this.meta(mode !== "both" ? 0.74 : 0.55, false),
        style: this.meta(style !== "Chill" ? 0.62 : 0.46, style === "Chill"),
        availability: this.meta(
          availability !== "Flexible" ? 0.76 : 0.41,
          availability === "Flexible",
        ),
        location: this.meta(area || country ? 0.72 : 0.28, !area && !country),
        firstIntent: this.meta(0.9, false),
        persona: this.meta(0.64, true),
      },
    };
  }

  private goalsFromIntent(intentType?: IntentType) {
    if (intentType === IntentType.GROUP) {
      return ["Join small groups", "Meet people"];
    }
    if (intentType === IntentType.ACTIVITY) {
      return ["Find things to do", "Make plans"];
    }
    if (intentType === IntentType.CHAT) {
      return ["Talk about interests", "Meet people"];
    }
    return [];
  }

  private personaFromSignals(input: {
    goals: string[];
    interests: string[];
    format: OnboardingInferResponse["format"];
    style: OnboardingInferResponse["style"];
  }) {
    const hasPlans =
      input.goals.includes("Make plans") ||
      input.goals.includes("Find things to do");
    const hasPeople =
      input.goals.includes("Meet people") ||
      input.goals.includes("Join small groups");
    const hasIdeas =
      input.goals.includes("Professional / ideas") ||
      input.interests.includes("AI") ||
      input.interests.includes("Startups") ||
      input.interests.includes("Design");

    if (hasPlans && hasPeople) return "Connector";
    if (hasIdeas) return "Researcher";
    if (input.style === "Planned") return "Planner";
    if (input.style === "Spontaneous") return "Explorer";
    if (input.format === "small_groups") return "Social Builder";
    return "Explorer";
  }

  private summaryFromSignals(input: {
    goals: string[];
    interests: string[];
    format: OnboardingInferResponse["format"];
    availability: OnboardingInferResponse["availability"];
    area: string;
    country: string;
  }) {
    const location = [input.area.trim(), input.country.trim()]
      .filter(Boolean)
      .join(", ");
    const interests = this.unique(input.interests)
      .slice(0, 3)
      .join(", ")
      .toLowerCase();
    const socialTarget = input.goals.includes("Dating")
      ? "with some dating energy"
      : input.goals.includes("Meet people")
        ? "to meet the right people"
        : "to move something social forward";
    const format =
      input.format === "one_to_one"
        ? "mostly 1:1"
        : input.format === "small_groups"
          ? "mostly in small groups"
          : "across 1:1 and small groups";
    return [
      "You look like someone",
      interests ? `into ${interests}` : "with clear interests",
      socialTarget,
      format,
      input.availability
        ? `with a ${input.availability.toLowerCase()} rhythm`
        : "",
      location ? `around ${location}` : "",
    ]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private meta(confidence: number, needsConfirmation: boolean) {
    return {
      source: "voice" as const,
      confidence,
      needsConfirmation,
    };
  }

  private unique(values: string[]) {
    return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
  }
}
