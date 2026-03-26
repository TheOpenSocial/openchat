export const openAIRoutingTasks = [
  "intent_parsing",
  "onboarding_fast_pass",
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
  onboarding_fast_pass: {
    task: "onboarding_fast_pass",
    version: "onboarding_fast_pass.v3",
    instructions: [
      "Infer a fast first-pass onboarding read for an agentic social app as strict JSON.",
      "Keep it lightweight and decisive.",
      "Return only JSON matching the requested schema.",
      "Include only the strongest 1-5 interests and 1-4 goals when clearly supported.",
      "Write one concise summary sentence grounded in concrete user details (interests, format, timing, or location).",
      "Avoid generic phrases like 'meet people' unless they are anchored with specific context from the transcript.",
      "Never return a summary that is only generic social boilerplate.",
      "Ask one calm followUpQuestion only when one missing detail would meaningfully improve the next step.",
      "Do not infer sensitive traits or identity characteristics.",
    ].join(" "),
  },
  onboarding_inference: {
    task: "onboarding_inference",
    version: "onboarding_inference.v3",
    instructions: [
      "Infer onboarding preferences for an agentic social app as strict JSON.",
      "The user is describing who they want to meet, what they want to do, and what they are into.",
      "Return only JSON matching the requested schema.",
      "Prefer concise normalized labels.",
      "Set needsConfirmation=true when the transcript is ambiguous or missing specifics.",
      "Generate one calm persona label that is specific to the transcript (not generic archetypes unless strongly justified by details).",
      "Avoid generic persona labels like Connector, Explorer, Planner, or Social Builder unless no concrete signals exist.",
      "Generate one concise summary sentence grounded in concrete transcript details (interests, format, style, availability, and/or location).",
      "Do not output generic summaries; include at least one concrete activity/topic and one concrete social preference when available.",
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
    version: "conversation_planning.v7",
    instructions:
      "Plan one bounded agentic turn as strict JSON with specialists, toolCalls, and responseGoal. Use provided socialContext, onboarding freshness, preferences, memory, and any visible scarcity signals to decide the next best action. Available tools include intent.parse, personalization.retrieve, availability.lookup, candidate.search, negotiation.evaluate, circle.search, group.plan, intent.persist, intro.send_request, intro.accept, intro.reject, intro.retract, circle.create, circle.join, profile.patch, conversation.start, memory.write, followup.schedule, notification.compose, moderation.review, workflow.read, and workflow.write. Prefer minimal safe steps and only use world-action tools when they move the user toward a concrete social outcome. Favor this ladder: clarify intent only when meaning is still ambiguous, use availability.lookup when timing or reachability matters, search or persist when the user is exploring, run negotiation.evaluate when there is a social or commerce counterpart-fit question before taking world actions, send or manage intros when a direct 1:1 path exists, create or join circles when group energy is explicit or search is sparse, use profile.patch only when the user explicitly asked to remember or change a default and consent is present in the tool input, and schedule follow-up when timing is the real blocker.",
  },
  conversation_response: {
    task: "conversation_response",
    version: "conversation_response.v3",
    instructions:
      "Write one concise assistant reply grounded in provided socialContext plus specialist/tool outputs. Sound human, warm, and agentic: proactive but never robotic, and never mention internal system states, pipelines, or matching engines. For fresh onboarding turns, acknowledge the user's goal, take one clear next-step stance, and ask at most one high-value follow-up only when needed.",
  },
};

export function getPromptDefinition(task: OpenAIRoutingTask): PromptDefinition {
  return promptRegistry[task];
}

export function getPromptVersion(task: OpenAIRoutingTask): string {
  return promptRegistry[task].version;
}
