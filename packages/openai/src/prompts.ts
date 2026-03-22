export const openAIRoutingTasks = [
  "intent_parsing",
  "onboarding_inference",
  "follow_up_question",
  "suggestion_generation",
  "ranking_explanation",
  "notification_copy",
  "moderation_assist",
  "conversation_planning",
  "conversation_response",
] as const;

export type OpenAIRoutingTask = (typeof openAIRoutingTasks)[number];

export interface PromptDefinition {
  task: OpenAIRoutingTask;
  version: string;
  instructions: string;
}

const promptRegistry: Record<OpenAIRoutingTask, PromptDefinition> = {
  intent_parsing: {
    task: "intent_parsing",
    version: "intent_parsing.v1",
    instructions: [
      "Parse the social intent into strict JSON.",
      "Include intent type, urgency, topics, activities, groupSizeTarget, confidence.",
      "If ambiguous, set requiresFollowUp=true and include followUpQuestion.",
    ].join(" "),
  },
  onboarding_inference: {
    task: "onboarding_inference",
    version: "onboarding_inference.v1",
    instructions: [
      "Infer onboarding preferences for an agentic social app as strict JSON.",
      "The user is describing who they want to meet, what they want to do, and what they are into.",
      "Return only JSON matching the requested schema.",
      "Prefer concise normalized labels.",
      "Set needsConfirmation=true when the transcript is ambiguous or missing specifics.",
      "Generate one calm persona label and one concise summary sentence.",
      "Include a followUpQuestion only when one missing detail would materially improve setup.",
      "Do not infer sensitive traits or identity characteristics.",
    ].join(" "),
  },
  follow_up_question: {
    task: "follow_up_question",
    version: "follow_up_question.v1",
    instructions:
      "Ask one concise follow-up question only when required to disambiguate intent constraints.",
  },
  suggestion_generation: {
    task: "suggestion_generation",
    version: "suggestion_generation.v1",
    instructions:
      "Generate concise social suggestions as strict JSON: { suggestions: [{ title, message, reason, confidence }] }.",
  },
  ranking_explanation: {
    task: "ranking_explanation",
    version: "ranking_explanation.v1",
    instructions:
      "Explain a ranking decision as strict JSON with fields candidateUserId, score, blockedByPolicy, reasons.",
  },
  notification_copy: {
    task: "notification_copy",
    version: "notification_copy.v1",
    instructions:
      "Write clear, neutral notification copy in one short sentence, preserving trust and safety constraints.",
  },
  moderation_assist: {
    task: "moderation_assist",
    version: "moderation_assist.v1",
    instructions:
      "Assess potentially unsafe content, classify risk, and return concise actionable guidance.",
  },
  conversation_planning: {
    task: "conversation_planning",
    version: "conversation_planning.v6",
    instructions:
      "Plan one bounded agentic turn as strict JSON with specialists, toolCalls, and responseGoal. Use provided socialContext, onboarding freshness, preferences, memory, and any visible scarcity signals to decide the next best action. Available tools include intent.parse, personalization.retrieve, availability.lookup, candidate.search, circle.search, group.plan, intent.persist, intro.send_request, intro.accept, intro.reject, intro.retract, circle.create, circle.join, profile.patch, conversation.start, memory.write, followup.schedule, notification.compose, moderation.review, workflow.read, and workflow.write. Prefer minimal safe steps and only use world-action tools when they move the user toward a concrete social outcome. Favor this ladder: clarify intent only when meaning is still ambiguous, use availability.lookup when timing or reachability matters, search or persist when the user is exploring, send or manage intros when a direct 1:1 path exists, create or join circles when group energy is explicit or search is sparse, use profile.patch only when the user explicitly asked to remember or change a default and consent is present in the tool input, and schedule follow-up when timing is the real blocker.",
  },
  conversation_response: {
    task: "conversation_response",
    version: "conversation_response.v2",
    instructions:
      "Write one concise assistant reply grounded in provided socialContext plus specialist/tool outputs. Sound agentic and outcome-oriented, not generic. For fresh onboarding turns, acknowledge the user's goal, act on it, and ask at most one high-value follow-up only when needed.",
  },
};

export function getPromptDefinition(task: OpenAIRoutingTask): PromptDefinition {
  return promptRegistry[task];
}

export function getPromptVersion(task: OpenAIRoutingTask): string {
  return promptRegistry[task].version;
}
