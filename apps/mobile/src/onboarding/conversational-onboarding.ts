import type { OnboardingDraftState } from "./onboarding-model";
import { applyIntakeToDraft } from "./onboarding-intake";

export type OnboardingMessage = {
  id: string;
  role: "agent" | "user";
  content: string;
};

export type InferredProfile = {
  goals: string[];
  interests: string[];
  format?: "one_to_one" | "small_groups" | "both";
  mode?: "online" | "in_person" | "both";
  style?: string;
  availability?: string;
  location?: string;
  firstIntent?: string;
};

function makeId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createAgentMessage(content: string): OnboardingMessage {
  return { id: makeId("agent"), role: "agent", content };
}

export function createUserMessage(content: string): OnboardingMessage {
  return { id: makeId("user"), role: "user", content };
}

export function inferProfile(state: OnboardingDraftState): InferredProfile {
  return {
    goals: state.onboardingGoals,
    interests: state.interests,
    format:
      state.preferredFormat === "group"
        ? "small_groups"
        : state.preferredFormat,
    mode: state.preferredMode,
    style: state.preferredStyle,
    availability: state.preferredAvailability,
    location:
      [state.area.trim(), state.country.trim()].filter(Boolean).join(", ") ||
      undefined,
    firstIntent: state.firstIntentText.trim() || undefined,
  };
}

export function isConversationalReady(state: OnboardingDraftState) {
  return Boolean(
    state.onboardingGoals.length > 0 &&
    state.interests.length > 0 &&
    state.firstIntentText.trim().length > 0 &&
    state.country.trim().length > 0,
  );
}

export function applyConversationalTurn(
  current: OnboardingDraftState,
  userText: string,
) {
  const next = applyIntakeToDraft(current, userText);
  const lower = userText.toLowerCase();

  if (
    /\b(1:1|one on one|one-to-one|just one person|private chat)\b/.test(lower)
  ) {
    next.preferredFormat = "one_to_one";
  } else if (/\b(small groups|group|groups|circle)\b/.test(lower)) {
    next.preferredFormat = "group";
  } else if (/\b(both|either works|mix)\b/.test(lower)) {
    next.preferredFormat = "both";
  }

  if (/\b(online|remote|virtual)\b/.test(lower)) {
    next.preferredMode = "online";
  } else if (/\b(in person|offline|nearby|local)\b/.test(lower)) {
    next.preferredMode = "in_person";
  } else if (/\b(both|either)\b/.test(lower)) {
    next.preferredMode = "both";
  }

  if (/\b(weekends|weekend)\b/.test(lower)) {
    next.preferredAvailability = "Weekends";
  } else if (/\b(evenings|after work|nights)\b/.test(lower)) {
    next.preferredAvailability = "Evenings";
  } else if (/\b(right now|today|tonight)\b/.test(lower)) {
    next.preferredAvailability = "Right now";
  } else if (/\b(flexible|anytime)\b/.test(lower)) {
    next.preferredAvailability = "Flexible";
  }

  if (/\b(chill|easygoing|relaxed)\b/.test(lower)) {
    next.preferredStyle = "Chill";
  } else if (/\b(spontaneous|spontaneity|impromptu)\b/.test(lower)) {
    next.preferredStyle = "Spontaneous";
  } else if (/\b(planned|organized|structured)\b/.test(lower)) {
    next.preferredStyle = "Planned";
  } else if (/\b(focused|serious|intentional)\b/.test(lower)) {
    next.preferredStyle = "Focused";
  } else if (/\b(outgoing|social|energetic)\b/.test(lower)) {
    next.preferredStyle = "Outgoing";
  }

  return next;
}

export function nextFollowUp(state: OnboardingDraftState): string | null {
  if (state.onboardingGoals.length === 0) {
    return "Got it. What are you hoping this leads to: meeting people, making plans, dating, or something else?";
  }
  if (state.interests.length < 2) {
    return "That helps. What are you into lately so I can aim this in the right direction?";
  }
  if (state.preferredFormat === "both") {
    return "Are you leaning more toward 1:1 chats or small groups first?";
  }
  if (state.preferredAvailability === "Flexible") {
    return "When are you usually open for this?";
  }
  if (!state.country.trim()) {
    return "Useful. What city or country should I anchor this around?";
  }
  if (!state.firstIntentText.trim()) {
    return "Perfect. If I were to start with one thing right now, what should I help make happen first?";
  }
  return "I’ve got enough to set this up well. Review it and we can continue.";
}
