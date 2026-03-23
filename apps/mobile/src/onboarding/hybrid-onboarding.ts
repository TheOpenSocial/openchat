import { applyIntakeToDraft } from "./onboarding-intake";
import type {
  InferredFieldMeta,
  OnboardingDraftState,
  OnboardingInferenceMeta,
} from "./onboarding-model";

export interface HybridInferenceResult {
  draft: OnboardingDraftState;
  summary: string;
  persona: string;
  followUpQuestion: string;
}

function inferredMeta(
  confidence: number,
  needsConfirmation: boolean,
): InferredFieldMeta {
  return {
    source: "voice",
    confidence,
    needsConfirmation,
  };
}

function unique(labels: string[]) {
  return [...new Set(labels.map((label) => label.trim()).filter(Boolean))];
}

function personaFromDraft(draft: OnboardingDraftState): string {
  const hasPlans =
    draft.onboardingGoals.includes("Make plans") ||
    draft.onboardingGoals.includes("Find things to do");
  const hasPeople =
    draft.onboardingGoals.includes("Meet people") ||
    draft.onboardingGoals.includes("Join small groups");
  const hasIdeas =
    draft.onboardingGoals.includes("Professional / ideas") ||
    draft.interests.includes("AI") ||
    draft.interests.includes("Startups") ||
    draft.interests.includes("Design");

  if (hasPlans && hasPeople) {
    return "Connector";
  }
  if (hasIdeas) {
    return "Researcher";
  }
  if (draft.preferredStyle === "Planned") {
    return "Planner";
  }
  if (draft.preferredStyle === "Spontaneous") {
    return "Explorer";
  }
  return "Social Builder";
}

function summaryFromDraft(draft: OnboardingDraftState) {
  const location = [draft.area.trim(), draft.country.trim()]
    .filter(Boolean)
    .join(", ");
  const interests = unique(draft.interests)
    .slice(0, 3)
    .join(", ")
    .toLowerCase();
  const socialTarget = draft.onboardingGoals.includes("Dating")
    ? "with some dating energy"
    : draft.onboardingGoals.includes("Meet people")
      ? "to meet the right people"
      : "to move something social forward";
  const format =
    draft.preferredFormat === "one_to_one"
      ? "mostly 1:1"
      : draft.preferredFormat === "group"
        ? "mostly in small groups"
        : "across 1:1 and small groups";

  return [
    "You look like someone",
    interests ? `into ${interests}` : "with clear interests",
    socialTarget,
    format,
    location ? `around ${location}` : "",
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function followUpQuestionFromDraft(draft: OnboardingDraftState): string {
  const goalsLowSignal =
    draft.onboardingGoals.length === 0 ||
    draft.inferenceMeta.goals.needsConfirmation ||
    draft.inferenceMeta.goals.confidence < 0.6;
  if (goalsLowSignal) {
    return "What are you hoping to do first?";
  }

  const interestsLowSignal =
    draft.interests.length < 2 ||
    draft.inferenceMeta.interests.needsConfirmation ||
    draft.inferenceMeta.interests.confidence < 0.6;
  if (interestsLowSignal) {
    return "What are you most into right now?";
  }

  const locationLowSignal =
    (!draft.area.trim() && !draft.country.trim()) ||
    draft.inferenceMeta.location.needsConfirmation ||
    draft.inferenceMeta.location.confidence < 0.6;
  if (locationLowSignal) {
    return "Where should we anchor this?";
  }

  const formatLowSignal =
    draft.preferredFormat === "both" ||
    draft.inferenceMeta.format.needsConfirmation ||
    draft.inferenceMeta.format.confidence < 0.7;
  if (formatLowSignal) {
    return "Do you want this to lean 1:1, small groups, or both?";
  }

  const modeLowSignal =
    draft.preferredMode === "both" ||
    draft.inferenceMeta.mode.needsConfirmation ||
    draft.inferenceMeta.mode.confidence < 0.7;
  if (modeLowSignal) {
    return "Should this be online, in person, or both?";
  }

  const styleLowSignal =
    draft.preferredStyle === "Chill" ||
    draft.inferenceMeta.style.needsConfirmation ||
    draft.inferenceMeta.style.confidence < 0.7;
  if (styleLowSignal) {
    return "Should this feel chilled, planned, or spontaneous?";
  }

  const availabilityLowSignal =
    draft.preferredAvailability === "Flexible" ||
    draft.inferenceMeta.availability.needsConfirmation ||
    draft.inferenceMeta.availability.confidence < 0.7;
  if (availabilityLowSignal) {
    return "When are you usually open?";
  }

  const firstIntentLowSignal =
    !draft.firstIntentText.trim() ||
    draft.inferenceMeta.firstIntent.needsConfirmation ||
    draft.inferenceMeta.firstIntent.confidence < 0.7;
  if (firstIntentLowSignal) {
    return "What should we help you do first?";
  }

  return "";
}

export async function inferHybridOnboarding(
  current: OnboardingDraftState,
  expression: string,
): Promise<HybridInferenceResult> {
  const nextDraft = applyIntakeToDraft(current, expression);
  const persona = personaFromDraft(nextDraft);
  const summary = summaryFromDraft(nextDraft);
  const inferenceMeta: OnboardingInferenceMeta = {
    ...current.inferenceMeta,
    goals: inferredMeta(
      nextDraft.onboardingGoals.length > 0 ? 0.84 : 0.42,
      nextDraft.onboardingGoals.length === 0,
    ),
    interests: inferredMeta(
      nextDraft.interests.length > 0 ? 0.8 : 0.38,
      nextDraft.interests.length < 2,
    ),
    format: inferredMeta(
      nextDraft.preferredFormat !== "both" ? 0.7 : 0.45,
      nextDraft.preferredFormat === "both",
    ),
    mode: inferredMeta(
      nextDraft.preferredMode !== "both" ? 0.68 : 0.4,
      nextDraft.preferredMode === "both",
    ),
    style: inferredMeta(
      nextDraft.preferredStyle !== "Chill" ? 0.62 : 0.46,
      nextDraft.preferredStyle === "Chill",
    ),
    availability: inferredMeta(
      nextDraft.preferredAvailability !== "Flexible" ? 0.76 : 0.41,
      nextDraft.preferredAvailability === "Flexible",
    ),
    location: inferredMeta(
      nextDraft.country.trim() || nextDraft.area.trim() ? 0.72 : 0.28,
      !nextDraft.country.trim() && !nextDraft.area.trim(),
    ),
    firstIntent: inferredMeta(
      nextDraft.firstIntentText.trim() ? 0.86 : 0.36,
      !nextDraft.firstIntentText.trim(),
    ),
    persona: inferredMeta(0.64, true),
  };

  const followUpQuestion = followUpQuestionFromDraft({
    ...nextDraft,
    inferenceMeta,
  });

  const hydrated: OnboardingDraftState = {
    ...nextDraft,
    persona,
    personaSummary: summary,
    inferenceMeta,
    followUpQuestion,
  };

  await new Promise((resolve) => setTimeout(resolve, 650));

  return {
    draft: hydrated,
    persona,
    summary,
    followUpQuestion,
  };
}
