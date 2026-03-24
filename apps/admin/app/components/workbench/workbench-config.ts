export type AdminTab =
  | "overview"
  | "users"
  | "intents"
  | "chats"
  | "moderation"
  | "personalization"
  | "agent";

export interface Banner {
  tone: "info" | "error" | "success";
  text: string;
}

export interface OnboardingActivationSnapshot {
  window: {
    hours: number;
    start: string;
    end: string;
  };
  counters: {
    started: number;
    succeeded: number;
    failed: number;
    processing: number;
  };
  metrics: {
    successRate: number | null;
    failureRate: number | null;
    processingRate: number | null;
    avgCompletionSeconds: number | null;
  };
}

export const tabConfig: Array<{
  id: AdminTab;
  label: string;
  subtitle: string;
}> = [
  {
    id: "overview",
    label: "Overview",
    subtitle:
      "Queue controls, health, dead-letter replay, and debug query helper",
  },
  {
    id: "users",
    label: "Users",
    subtitle: "Profile, trust, rules, sessions, inbox, and digest",
  },
  {
    id: "intents",
    label: "Intents",
    subtitle: "Inspect explanations and run follow-up superpowers",
  },
  {
    id: "chats",
    label: "Chats",
    subtitle: "Inspect metadata/sync and run stuck-flow repair actions",
  },
  {
    id: "moderation",
    label: "Moderation",
    subtitle:
      "Reports, blocks, queue, agent-thread risk flags (triage / assign)",
  },
  {
    id: "personalization",
    label: "Personalization",
    subtitle: "Inspect life graph and explain policy decisions",
  },
  {
    id: "agent",
    label: "Agent",
    subtitle: "Inspect thread traces with live SSE stream viewer",
  },
];

export function tabSubtitle(tab: AdminTab) {
  return tabConfig.find((entry) => entry.id === tab)?.subtitle ?? "";
}
