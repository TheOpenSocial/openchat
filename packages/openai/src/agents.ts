export const openAIAgentRoles = [
  "manager",
  "intent_parser",
  "ranking_explanation",
  "personalization_interpreter",
  "notification_copy",
  "moderation_assistant",
] as const;

export type OpenAIAgentRole = (typeof openAIAgentRoles)[number];

export const agentTools = [
  "intent.parse",
  "ranking.explain",
  "personalization.retrieve",
  "candidate.search",
  "intent.persist",
  "conversation.start",
  "memory.write",
  "followup.schedule",
  "notification.compose",
  "moderation.review",
  "workflow.read",
  "workflow.write",
] as const;
export type AgentTool = (typeof agentTools)[number];

export const agentBackgroundTasks = [
  "intent_followup",
  "digest_generation",
  "ranking_recheck",
  "moderation_recheck",
] as const;
export type AgentBackgroundTask = (typeof agentBackgroundTasks)[number];

export const agentActionTypes = [
  "cancel_intent_flow",
  "override_safety_block",
  "force_create_connection",
  "bulk_invite_over_cap",
  "send_digest_now",
  "widen_filters",
] as const;
export type AgentActionType = (typeof agentActionTypes)[number];

export type AgentRiskLevel = "low" | "medium" | "high";

interface AgentDefinition {
  role: OpenAIAgentRole;
  summary: string;
  handoffTargets: OpenAIAgentRole[];
  allowedTools: AgentTool[];
}

const openAIAgentDefinitions: Record<OpenAIAgentRole, AgentDefinition> = {
  manager: {
    role: "manager",
    summary:
      "Coordinates social-intent lifecycle and delegates specialist tasks.",
    handoffTargets: [
      "intent_parser",
      "ranking_explanation",
      "personalization_interpreter",
      "notification_copy",
      "moderation_assistant",
    ],
    allowedTools: [
      "workflow.read",
      "workflow.write",
      "candidate.search",
      "intent.persist",
      "conversation.start",
      "followup.schedule",
    ],
  },
  intent_parser: {
    role: "intent_parser",
    summary: "Extracts structured intent from natural language requests.",
    handoffTargets: ["manager"],
    allowedTools: ["intent.parse"],
  },
  ranking_explanation: {
    role: "ranking_explanation",
    summary: "Explains candidate ranking decisions from feature inputs.",
    handoffTargets: ["manager"],
    allowedTools: ["ranking.explain", "workflow.read"],
  },
  personalization_interpreter: {
    role: "personalization_interpreter",
    summary: "Interprets explicit and inferred user preference signals.",
    handoffTargets: ["manager"],
    allowedTools: ["personalization.retrieve", "memory.write", "workflow.read"],
  },
  notification_copy: {
    role: "notification_copy",
    summary: "Generates concise notification and follow-up copy variants.",
    handoffTargets: ["manager"],
    allowedTools: ["notification.compose", "workflow.read"],
  },
  moderation_assistant: {
    role: "moderation_assistant",
    summary: "Assists with safety/misuse review suggestions and escalations.",
    handoffTargets: ["manager"],
    allowedTools: ["moderation.review", "workflow.read"],
  },
};

const openAIBackgroundRunPolicy: Record<
  OpenAIAgentRole,
  AgentBackgroundTask[]
> = {
  manager: ["intent_followup", "digest_generation", "ranking_recheck"],
  intent_parser: ["intent_followup"],
  ranking_explanation: ["ranking_recheck"],
  personalization_interpreter: ["ranking_recheck"],
  notification_copy: ["digest_generation", "intent_followup"],
  moderation_assistant: ["moderation_recheck"],
};

const humanApprovalActions = new Set<AgentActionType>([
  "cancel_intent_flow",
  "override_safety_block",
  "force_create_connection",
  "bulk_invite_over_cap",
]);

export function getOpenAIAgentDefinition(
  role: OpenAIAgentRole,
): AgentDefinition {
  return openAIAgentDefinitions[role];
}

export function canAgentHandoff(
  from: OpenAIAgentRole,
  to: OpenAIAgentRole,
): boolean {
  return openAIAgentDefinitions[from].handoffTargets.includes(to);
}

export function canAgentUseTool(
  role: OpenAIAgentRole,
  tool: AgentTool,
): boolean {
  return openAIAgentDefinitions[role].allowedTools.includes(tool);
}

export function canAgentRunInBackground(
  role: OpenAIAgentRole,
  task: AgentBackgroundTask,
): boolean {
  return openAIBackgroundRunPolicy[role].includes(task);
}

export function requiresHumanApproval(input: {
  role: OpenAIAgentRole;
  action: AgentActionType;
  riskLevel: AgentRiskLevel;
}): boolean {
  if (input.riskLevel === "high") {
    return true;
  }

  if (input.action === "send_digest_now" && input.role !== "manager") {
    return true;
  }

  return humanApprovalActions.has(input.action);
}
