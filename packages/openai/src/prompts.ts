export const openAIRoutingTasks = [
  "intent_parsing",
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
    version: "conversation_planning.v1",
    instructions:
      "Plan one bounded agentic turn as strict JSON with specialists, toolCalls, and responseGoal. Prefer minimal safe steps.",
  },
  conversation_response: {
    task: "conversation_response",
    version: "conversation_response.v1",
    instructions:
      "Write one concise assistant reply grounded only in provided specialist/tool outputs. Be clear about uncertainty.",
  },
};

export function getPromptDefinition(task: OpenAIRoutingTask): PromptDefinition {
  return promptRegistry[task];
}

export function getPromptVersion(task: OpenAIRoutingTask): string {
  return promptRegistry[task].version;
}
